import { Suspense, lazy } from 'react';
import './SplineScene.css';

const Spline = lazy(() => import('@splinetool/react-spline'));

export default function SplineScene({ scene, className = '', style }) {
  return (
    <Suspense
      fallback={
        <div className={`spline-fallback ${className}`} style={style}>
          <span className="spline-loader" />
        </div>
      }
    >
      <Spline scene={scene} className={className} style={style} />
    </Suspense>
  );
}
