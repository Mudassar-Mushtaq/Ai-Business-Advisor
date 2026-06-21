import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import { Zap, BarChart2, TrendingUp, Package, Shield, Mail, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import SplineScene from '../components/SplineScene/SplineScene';
import Spotlight from '../components/SplineScene/Spotlight';
import './Login.css';

// Map Firebase error codes to user-friendly messages
const firebaseErrorMessage = (code) => {
  const map = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Invalid email or password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed. Please try again.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled.',
  };
  return map[code] || 'Something went wrong. Please try again.';
};

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  // Once AuthContext finishes the backend sync and `user` is populated,
  // navigate to the dashboard. This avoids the race where Firebase auth has
  // resolved but the MongoDB user profile hasn't loaded yet.
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  // Defensive redirect — if the page is rendered while already authenticated.
  if (user) return <Navigate to="/dashboard" replace />;

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  // Email/Password submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        // Client-side validations
        if (!form.name.trim()) { setError('Name is required.'); setLoading(false); return; }
        if (form.name.trim().length < 2) { setError('Name must be at least 2 characters.'); setLoading(false); return; }
        if (!form.email.trim()) { setError('Email is required.'); setLoading(false); return; }
        if (form.password.length < 6) { setError('Password must be at least 6 characters.'); setLoading(false); return; }
        if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); setLoading(false); return; }

        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          form.email.trim(),
          form.password
        );

        // Set display name in Firebase profile
        await updateProfile(userCredential.user, {
          displayName: form.name.trim(),
        });

        toast.success('Account created successfully! 🎉');
        // Wait for AuthContext to finish the backend sync — useEffect above
        // will navigate to /dashboard the moment `user` is populated.
      } else {
        // Login
        if (!form.email.trim()) { setError('Email is required.'); setLoading(false); return; }
        if (!form.password) { setError('Password is required.'); setLoading(false); return; }

        await signInWithEmailAndPassword(auth, form.email.trim(), form.password);
        toast.success('Welcome back! 👋');
      }
    } catch (err) {
      console.error('Auth error:', err.code, err.message);
      setError(firebaseErrorMessage(err.code));
      setLoading(false);
      return;
    }
    // Keep `loading` true while AuthContext finishes syncing — button stays
    // disabled and shows the spinner until navigation fires.
  };

  // Google Sign-In
  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success('Signed in with Google! 🎉');
      setSubmitted(true);
      // useEffect above navigates once AuthContext populates `user`.
    } catch (err) {
      console.error('Google sign-in error:', err.code, err.message);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(firebaseErrorMessage(err.code));
      }
      setGoogleLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError('');
    setForm({ name: '', email: '', password: '', confirmPassword: '' });
    setShowPass(false);
    setShowConfirm(false);
  };

  const features = [
    { icon: BarChart2,  label: 'Sales Analytics',  desc: 'Deep insights from your data' },
    { icon: TrendingUp, label: 'AI Forecasting',    desc: 'Random Forest predictions'   },
    { icon: Package,    label: 'Inventory Alerts',  desc: 'Never run out of stock'       },
    { icon: Shield,     label: 'Secure & Private',  desc: 'Your data stays yours'        },
  ];

  return (
    <div className="login-page">
      {/* Left Panel */}
      <div className="login-left">
        {/* Spotlight + 3D Spline Background */}
        <Spotlight className="login-spotlight" fill="white" />
        <div className="login-spline">
          <SplineScene
            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
            className="login-spline-canvas"
          />
        </div>
        {/* Gradient veil keeps text crisp over the 3D scene */}
        <div className="login-left-veil" />

        <div className="login-left-content">
          <div className="login-brand">
            <div className="login-logo"><Zap size={28} /></div>
            <span className="login-brand-name">AI Business Advisor</span>
          </div>

          <div className="login-hero">
            <h1 className="login-headline">
              Your AI-Powered<br />
              <span className="gradient-text">Business Advisor</span>
            </h1>
            <p className="login-subtext">
              Upload your sales data, get instant AI insights, Random Forest forecasts, and smart inventory alerts — all in one place.
            </p>
          </div>

          <div className="login-features">
            {features.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="login-feature">
                <div className="login-feature-icon"><Icon size={18} /></div>
                <div>
                  <div className="login-feature-label">{label}</div>
                  <div className="login-feature-desc">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subtle orbs for color depth */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      {/* Right Panel */}
      <div className="login-right">
        <div className="login-card fade-in">
          <div className="login-card-header">
            <div className="login-logo-sm"><Zap size={20} /></div>
            <h2>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
            <p>{mode === 'login' ? 'Sign in to access your dashboard' : 'Sign up to get started with AI Business Advisor'}</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="auth-error fade-in">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'signup' && (
              <div className="auth-input-group">
                <User size={18} className="auth-input-icon" />
                <input
                  type="text"
                  name="name"
                  id="auth-name"
                  className="auth-input"
                  placeholder="Full Name"
                  value={form.name}
                  onChange={handleChange}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="auth-input-group">
              <Mail size={18} className="auth-input-icon" />
              <input
                type="email"
                name="email"
                id="auth-email"
                className="auth-input"
                placeholder="Email Address"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
              />
            </div>

            <div className="auth-input-group">
              <Lock size={18} className="auth-input-icon" />
              <input
                type={showPass ? 'text' : 'password'}
                name="password"
                id="auth-password"
                className="auth-input"
                placeholder={mode === 'signup' ? 'Create Password (min 6 chars)' : 'Password'}
                value={form.password}
                onChange={handleChange}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              <button type="button" className="auth-eye-btn" onClick={() => setShowPass(!showPass)} tabIndex={-1}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {mode === 'signup' && (
              <div className="auth-input-group">
                <Lock size={18} className="auth-input-icon" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  name="confirmPassword"
                  id="auth-confirm-password"
                  className="auth-input"
                  placeholder="Confirm Password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />
                <button type="button" className="auth-eye-btn" onClick={() => setShowConfirm(!showConfirm)} tabIndex={-1}>
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}

            {/* Password match indicator for signup */}
            {mode === 'signup' && form.confirmPassword && (
              <div className={`password-match ${form.password === form.confirmPassword ? 'match' : 'no-match'}`}>
                {form.password === form.confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
              </div>
            )}

            <button type="submit" id="auth-submit-btn" className="auth-submit-btn" disabled={loading || googleLoading}>
              {loading ? (
                <><div className="spinner" /> {mode === 'signup' ? 'Creating Account...' : 'Signing In...'}</>
              ) : (
                mode === 'signup' ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="login-divider"><span>or</span></div>

          {/* Google Sign-In via Firebase */}
          <button
            type="button"
            id="google-sign-in-btn"
            className="google-btn"
            onClick={handleGoogleSignIn}
            disabled={loading || googleLoading}
          >
            {googleLoading ? (
              <><div className="spinner" /> Signing in...</>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>

          {/* Switch mode */}
          <div className="auth-switch">
            {mode === 'login' ? (
              <p>Don't have an account? <button type="button" onClick={switchMode} className="auth-switch-btn">Sign Up</button></p>
            ) : (
              <p>Already have an account? <button type="button" onClick={switchMode} className="auth-switch-btn">Sign In</button></p>
            )}
          </div>

          <div className="login-footer-note">
            <Shield size={14} />
            Your data is encrypted and never shared.
          </div>
        </div>
      </div>
    </div>
  );
}
