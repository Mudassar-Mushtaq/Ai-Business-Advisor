from flask import Flask, request, jsonify
from flask_cors import CORS
from model import train_and_forecast
import traceback

app = Flask(__name__)
CORS(app, origins=['http://localhost:5001'])


# Lazy import — Prophet is heavy (cmdstanpy compile, ~200MB) so we only load
# it the first time a Prophet request comes in. If it's not installed the RF
# path keeps working.
_prophet_fn = None
_prophet_import_error = None


def _load_prophet():
    global _prophet_fn, _prophet_import_error
    if _prophet_fn is not None:
        return _prophet_fn
    if _prophet_import_error is not None:
        raise _prophet_import_error
    try:
        from prophet_model import train_and_forecast_prophet
        _prophet_fn = train_and_forecast_prophet
        return _prophet_fn
    except Exception as e:
        _prophet_import_error = e
        raise


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'OK',
        'service': 'Forecasting Service',
        'models': ['rf', 'prophet'],
    })


@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json(force=True)
        product = data.get('product', 'Unknown')
        sales_history = data.get('sales_history', [])
        model_name = (data.get('model') or 'rf').lower().strip()
        try:
            forecast_days = int(data.get('forecast_days', 30))
        except (TypeError, ValueError):
            forecast_days = 30
        forecast_days = max(1, min(forecast_days, 180))  # clamp 1..180

        if not sales_history:
            return jsonify({'error': 'sales_history is required and must be non-empty.'}), 400

        if model_name == 'prophet':
            try:
                fn = _load_prophet()
            except Exception as e:
                return jsonify({
                    'error': f'Prophet model is not available: {e}. Run `pip install prophet` in ml_service/venv.'
                }), 503
            result = fn(product, sales_history, forecast_days=forecast_days)
            result.setdefault('model', 'prophet')
        else:
            result = train_and_forecast(product, sales_history, forecast_days=forecast_days)
            result.setdefault('model', 'rf')

        return jsonify(result)

    except ValueError as ve:
        return jsonify({'error': str(ve)}), 422
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Model training failed: {str(e)}'}), 500


if __name__ == '__main__':
    print('🤖 ML Forecast Service starting on port 8000 (models: rf, prophet)...')
    # threaded=True lets Flask handle multiple /predict calls concurrently.
    # Each RandomForest already uses n_jobs=-1 internally, so a small number
    # of in-flight requests is enough to saturate the CPU.
    app.run(host='0.0.0.0', port=8000, debug=False, threaded=True)
