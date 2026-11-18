import React, { useState } from 'react';
import { AppConfig, GTKData } from '../types';
import { fetchGTKDirectly } from '../services/sheetsSync';
import { DAPO1_BASE64 } from '../assets/dapo1Base64';
import bgImage from '../assets/bg.png';
import { 
  LogIn, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  ArrowRight, 
  ArrowLeft,
  Building2,
  KeyRound
} from 'lucide-react';

interface LoginViewProps {
  gtkList: GTKData[];
  appConfig?: AppConfig;
  onLogin: (gtk: GTKData) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ gtkList, appConfig, onLogin }) => {
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const targetUsername = usernameInput.trim().toLowerCase();
    const rawPassword = passwordInput;

    if (!targetUsername) {
      setErrorMsg('Silakan masukkan Username (Email GTK) Anda terlebih dahulu.');
      return;
    }

    if (!rawPassword) {
      setErrorMsg('Silakan masukkan Password Anda terlebih dahulu.');
      return;
    }

    setIsLoading(true);

    let candidateList = gtkList;
    let fetchedFresh = false;

    try {
      const res = await fetch('/api/gtk?force=true', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
          candidateList = json.data;
          fetchedFresh = true;
        }
      }
    } catch {}

    if (!fetchedFresh && appConfig) {
      try {
        const directData = await fetchGTKDirectly(appConfig);
        if (directData && directData.length > 0) {
          candidateList = directData;
        }
      } catch {}
    }

    // Cari GTK berdasarkan header email pada sheet gtk
    const emailMatches = candidateList.filter((g) => {
      const gEmail = String(g.email || '').trim().toLowerCase();
      return gEmail !== '' && gEmail !== '-' && gEmail === targetUsername;
    });

    if (emailMatches.length === 0) {
      setIsLoading(false);
      setErrorMsg(
        `Username "${usernameInput.trim()}" tidak ditemukan pada kolom email sheet GTK.`
      );
      return;
    }

    // Cocokkan password dari header password pada sheet gtk
    const matched = emailMatches.find((g) => {
      const sheetPassword = String(g.password ?? g.pasword ?? '');
      if (!sheetPassword.trim()) return false;
      return sheetPassword === rawPassword || sheetPassword.trim() === rawPassword.trim();
    });

    setIsLoading(false);

    if (matched) {
      const { password: _pwd, pasword: _pasword, ...safeUser } = matched as any;
      onLogin(safeUser as GTKData);
    } else {
      const hasAnyPasswordSet = emailMatches.some((g) => String(g.password ?? g.pasword ?? '').trim() !== '');
      if (!hasAnyPasswordSet) {
        setErrorMsg(
          'Password untuk akun ini belum diisi di kolom password pada sheet GTK. Silakan hubungi Admin.'
        );
      } else {
        setErrorMsg('Password yang Anda masukkan salah. Silakan periksa kembali.');
      }
    }
  };

  // Tampilan awal: Kartu Autentikasi Pengguna Dapodik (SSO Gate) sesuai gambar
  if (!showLoginForm) {
    return (
      <div className="min-h-screen bg-[#eef3f8] flex items-center justify-center p-4 sm:p-6 antialiased">
        <div className="w-full max-w-[460px] bg-white rounded-sm shadow-[0_6px_28px_rgba(15,23,42,0.08)] border border-slate-200/80 overflow-hidden animate-in fade-in duration-200">
          {/* Scenic Mountain Sunset Header Banner */}
          <div className="relative h-36 sm:h-40 w-full overflow-hidden bg-gradient-to-b from-[#d8e1ec] via-[#e8d9dc] to-[#a9b7cf]">
            <svg
              viewBox="0 0 600 200"
              preserveAspectRatio="xMidYMid slice"
              className="absolute inset-0 w-full h-full"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dbe4ef" />
                  <stop offset="55%" stopColor="#efd8d6" />
                  <stop offset="100%" stopColor="#d4c7d9" />
                </linearGradient>
                <linearGradient id="farMtn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9aa7c2" />
                  <stop offset="100%" stopColor="#72819f" />
                </linearGradient>
                <linearGradient id="midMtn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8592ad" />
                  <stop offset="100%" stopColor="#586685" />
                </linearGradient>
                <linearGradient id="halfDome" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#bfa1a3" />
                  <stop offset="45%" stopColor="#887a8c" />
                  <stop offset="100%" stopColor="#4c5874" />
                </linearGradient>
              </defs>
              <rect width="600" height="200" fill="url(#skyGrad)" />
              {/* Distant mountain ridge */}
              <path d="M0,132 L75,112 L150,126 L230,98 L315,118 L395,94 L475,114 L545,102 L600,118 L600,200 L0,200 Z" fill="url(#farMtn)" opacity="0.78" />
              {/* Midground valley ridges */}
              <path d="M0,152 L90,130 L185,148 L275,120 L360,138 L445,118 L530,136 L600,125 L600,200 L0,200 Z" fill="url(#midMtn)" opacity="0.88" />
              {/* Prominent Yosemite-style monolith on left */}
              <path d="M40,200 L68,95 Q85,50 112,48 Q128,48 136,72 L162,135 L198,175 L235,200 Z" fill="url(#halfDome)" />
              {/* Light granite cliff highlight */}
              <path d="M98,52 Q112,48 126,64 L132,126 L108,162 L88,125 Z" fill="#e5c3ba" opacity="0.48" />
              {/* Foreground dark pine ridge */}
              <path d="M0,168 L58,154 L125,172 L210,162 L295,180 L410,166 L505,156 L600,168 L600,200 L0,200 Z" fill="#3b4863" opacity="0.85" />
            </svg>
          </div>

          {/* Centered Circular White Logo overlapping banner */}
          <div className="relative flex justify-center -mt-12 z-10">
            <div className="w-24 h-24 rounded-full bg-white shadow-[0_6px_20px_rgba(15,23,42,0.16)] border border-slate-100 flex items-center justify-center p-4">
              <img
                src={DAPO1_BASE64 || '/dapo-1.png'}
                alt="Logo Dapodik"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          {/* Center Body: Autentikasi & SSO Button */}
          <div className="px-6 pt-5 pb-8 text-center">
            <h1 className="text-xl font-normal text-slate-600 tracking-tight">
              Autentikasi
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Pengguna Dapodik
            </p>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowLoginForm(true)}
                className="inline-flex items-center justify-center gap-2.5 px-7 py-3 rounded-full bg-[#03a9f4] hover:bg-[#029ae0] active:bg-[#0288c7] text-white text-xs sm:text-[13px] font-semibold uppercase tracking-wide shadow-[0_6px_18px_rgba(3,169,244,0.35)] hover:shadow-[0_8px_22px_rgba(3,169,244,0.45)] transition-all cursor-pointer"
              >
                <KeyRound className="w-4 h-4 -rotate-45" />
                <span>LOGIN MENGGUNAKAN SSO</span>
              </button>
            </div>
          </div>

          {/* Bottom Info Section */}
          <div className="bg-[#f4f7fa] border-t border-slate-200/70 px-7 sm:px-9 py-5 text-left">
            <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>Pastikan menggunakan email yang aktif</li>
              <li>Tidak diperkenankan menggunakan email orang lain</li>
              <li>Pengaturan ulang akun dapat melalui Manajemen Dapodik</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 antialiased overflow-hidden bg-slate-950">
      {/* Background Image: Fit/Fill whole viewport completely without cropping */}
      <img
        src={bgImage || "/bg.png"}
        alt="Background Form Login SMKN 1 Palopo"
        className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
      />
      {/* Subtle translucent veil so text and login card contrast perfectly while preserving the full image */}
      <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] pointer-events-none" />

      {/* Decorative Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-[460px] z-10">
        {/* Card Header & Brand with Glassmorphism - Sized to match Autentikasi Pengguna Dapodik */}
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-indigo-950/40 border border-white/50 overflow-hidden transition-all duration-300">
          {/* Top Brand Banner - Compact height matching Autentikasi banner */}
          <div className="bg-gradient-to-r from-[#440b82] via-[#291e8e] to-[#0c62d8] px-6 py-5 text-white text-center relative overflow-hidden">
            {/* Background Decorative: Left Concentric Arcs / Waves */}
            <svg 
              className="absolute -left-12 -top-12 w-56 h-56 pointer-events-none opacity-20" 
              viewBox="0 0 200 200" 
              fill="none"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="110" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
              <circle cx="50" cy="50" r="85" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />
              <circle cx="50" cy="50" r="60" stroke="white" strokeWidth="1" strokeOpacity="0.6" />
              <circle cx="50" cy="50" r="35" stroke="white" strokeWidth="0.8" strokeOpacity="0.7" />
            </svg>

            {/* Background Decorative: Right Tech Wireframe / Mesh Waves */}
            <svg 
              className="absolute -right-6 -bottom-6 w-64 h-40 pointer-events-none opacity-30" 
              viewBox="0 0 300 200" 
              fill="none"
              aria-hidden="true"
            >
              <path d="M40,180 Q120,80 200,120 T320,50" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.8" fill="none" />
              <path d="M20,190 Q105,95 185,135 T305,70" stroke="#60a5fa" strokeWidth="0.8" strokeOpacity="0.7" fill="none" />
              <path d="M60,170 Q135,65 215,105 T335,35" stroke="#38bdf8" strokeWidth="0.8" strokeOpacity="0.6" fill="none" />
              <path d="M0,200 Q85,115 165,155 T285,90" stroke="#93c5fd" strokeWidth="0.7" strokeOpacity="0.5" fill="none" />
              <path d="M80,160 L120,95 L150,115 L190,85 L230,125 L260,95 L300,130" stroke="#38bdf8" strokeWidth="0.6" strokeOpacity="0.5" fill="none" />
              <path d="M120,95 L160,125 L200,135 L240,155 L280,125" stroke="#93c5fd" strokeWidth="0.5" strokeOpacity="0.4" fill="none" />
              <path d="M150,115 L180,95 L220,135 L260,105" stroke="#38bdf8" strokeWidth="0.5" strokeOpacity="0.3" fill="none" />
            </svg>

            {/* Subtle light aura glow behind squircle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[65%] w-28 h-28 bg-blue-400/25 rounded-full blur-xl pointer-events-none" />

            {/* Center Logo Squircle with Glowing Double Aura */}
            <div className="relative z-10 mx-auto mb-2 inline-flex items-center justify-center">
              {/* Outer Glowing Ring */}
              <div className="p-0.5 rounded-[20px] bg-gradient-to-br from-white/70 via-blue-200/40 to-indigo-300/30 shadow-[0_0_22px_rgba(96,165,250,0.6),0_8px_18px_rgba(0,0,0,0.3)] outline outline-2 outline-white/30 outline-offset-2">
                {/* White Squircle Box */}
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white rounded-[18px] p-2 flex items-center justify-center shadow-inner">
                  {/* Logo Asli Sekolah SMKN 1 Palopo */}
                  <img
                    src={DAPO1_BASE64 || '/dapo-1.png'}
                    alt="Logo SMKN 1 Palopo"
                    className="w-full h-full object-contain drop-shadow-xs"
                  />
                </div>
              </div>
            </div>

            {/* Title & Subtitle */}
            <h1 className="text-xl font-black tracking-wider text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
              DAPODIK
            </h1>
            <p className="text-[11px] sm:text-xs text-blue-50/90 font-medium tracking-normal">
              SMKN 1 PALOPO
            </p>
          </div>

          {/* Form Content */}
          <div className="px-6 py-5 sm:px-7 sm:py-5 space-y-3.5">
            <div className="text-center">
              <h2 className="text-sm font-bold text-slate-800">
                Masuk ke Aplikasi
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Gunakan Email GTK dan Password yang terdaftar
              </p>
            </div>

            {/* Error Notification */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{errorMsg}</div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              {/* Username (Email) */}
              <div>
                <label htmlFor="login-username" className="block text-xs font-bold text-slate-700 mb-1">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4 text-slate-500" />
                  </div>
                  <input
                    id="login-username"
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    aria-label="Username"
                    value={usernameInput}
                    onChange={(e) => {
                      setUsernameInput(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="Masukkan email GTK"
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-white focus:bg-white rounded-xl border border-slate-300 font-semibold text-slate-800 placeholder:text-slate-400 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="login-password" className="block text-xs font-bold text-slate-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4 text-slate-500" />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    aria-label="Password"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="Masukkan password"
                    className="w-full pl-10 pr-11 py-2 bg-slate-50 hover:bg-white focus:bg-white rounded-xl border border-slate-300 font-semibold text-slate-800 placeholder:text-slate-400 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-indigo-200 transition-all cursor-pointer disabled:opacity-50 mt-1"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Masuk ke Aplikasi</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowLoginForm(false);
                  setErrorMsg(null);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali ke Autentikasi SSO</span>
              </button>
            </form>

            {/* Footer school info */}
            <div className="text-center pt-2.5 border-t border-slate-100">
              <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                <Building2 className="w-3 h-3" /> SMKN 1 Palopo • Sulawesi Selatan
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
