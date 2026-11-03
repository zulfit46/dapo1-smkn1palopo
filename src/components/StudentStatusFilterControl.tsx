import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Check, 
  UserCheck, 
  UserX, 
  Users, 
  Info,
  ChevronDown
} from 'lucide-react';
import { 
  StudentStatusFilterSetting, 
  getCachedStudentStatusFilterSetting, 
  fetchStudentStatusFilterFromServer, 
  updateStudentStatusFilterSettingOnServer 
} from '../utils/studentFilter';

interface StudentStatusFilterControlProps {
  isAdmin: boolean;
  className?: string;
  variant?: 'banner' | 'toolbar' | 'compact' | 'segmented';
  onFilterChange?: (setting: StudentStatusFilterSetting) => void;
}

export const StudentStatusFilterControl: React.FC<StudentStatusFilterControlProps> = ({
  isAdmin,
  className = '',
  variant = 'segmented',
  onFilterChange
}) => {
  const [currentSetting, setCurrentSetting] = useState<StudentStatusFilterSetting>(() => 
    getCachedStudentStatusFilterSetting()
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let isMounted = true;
    fetchStudentStatusFilterFromServer().then((setting) => {
      if (isMounted) {
        setCurrentSetting(setting);
        if (onFilterChange) onFilterChange(setting);
      }
    });

    const handleSettingChange = (e: any) => {
      if (isMounted && e.detail) {
        setCurrentSetting(e.detail);
        if (onFilterChange) onFilterChange(e.detail);
      }
    };

    window.addEventListener('dapodik_student_status_filter_changed', handleSettingChange);
    return () => {
      isMounted = false;
      window.removeEventListener('dapodik_student_status_filter_changed', handleSettingChange);
    };
  }, [onFilterChange]);

  const handleSelectSetting = async (setting: StudentStatusFilterSetting) => {
    if (setting === currentSetting && !isUpdating) {
      setShowDropdown(false);
      return;
    }

    setIsUpdating(true);
    setShowDropdown(false);

    try {
      const res = await updateStudentStatusFilterSettingOnServer(setting);
      setCurrentSetting(res.filter);
      if (onFilterChange) onFilterChange(res.filter);

      const labelMap: Record<StudentStatusFilterSetting, string> = {
        aktif: 'Siswa Aktif Saja',
        tidak_aktif: 'Siswa Tidak Aktif Saja',
        semua: 'Keduanya (Semua Siswa)'
      };

      setToastMessage(`Pengaturan User/Wali Kelas: ${labelMap[setting]}`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch {
      setToastMessage('Gagal memperbarui pengaturan');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsUpdating(false);
    }
  };

  // Cek posisi layar apakah dropdown perlu membuka ke atas agar tidak terpotong
  const handleToggleDropdown = () => {
    if (!showDropdown && dropdownButtonRef.current) {
      const rect = dropdownButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Jika ruang di bawah kurang dari 280px dan ruang di atas lebih besar, buka ke atas
      setOpenUpward(spaceBelow < 280 && rect.top > 280);
    }
    setShowDropdown(!showDropdown);
  };

  // Label & info helper
  const getLabelInfo = (setting: StudentStatusFilterSetting) => {
    switch (setting) {
      case 'aktif':
        return {
          title: 'Siswa Aktif Saja',
          shortTitle: 'Siswa Aktif',
          desc: 'Akun User/Wali Kelas hanya melihat siswa berstatus aktif',
          icon: <UserCheck className="w-3.5 h-3.5 text-emerald-600" />,
          badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dotBg: 'bg-emerald-500'
        };
      case 'tidak_aktif':
        return {
          title: 'Siswa Tidak Aktif Saja',
          shortTitle: 'Tidak Aktif',
          desc: 'Akun User/Wali Kelas hanya melihat siswa mutasi/keluar/tidak aktif',
          icon: <UserX className="w-3.5 h-3.5 text-rose-600" />,
          badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
          dotBg: 'bg-rose-500'
        };
      case 'semua':
      default:
        return {
          title: 'Keduanya (Semua Siswa)',
          shortTitle: 'Semua Siswa',
          desc: 'Akun User/Wali Kelas melihat seluruh siswa (aktif & tidak aktif)',
          icon: <Users className="w-3.5 h-3.5 text-blue-600" />,
          badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
          dotBg: 'bg-blue-500'
        };
    }
  };

  const activeInfo = getLabelInfo(currentSetting);

  // Jika bukan Admin (Akun User / Wali Kelas): Tampilkan banner / badge informatif
  if (!isAdmin) {
    if (variant === 'compact') {
      return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${activeInfo.badgeBg} ${className}`}>
          <span className={`w-2 h-2 rounded-full ${activeInfo.dotBg}`}></span>
          <span>Filter Admin: <strong>{activeInfo.title}</strong></span>
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${activeInfo.badgeBg} ${className}`}>
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Mode Tampilan Siswa: <strong>{activeInfo.title}</strong> (ditetapkan oleh Admin)</span>
      </div>
    );
  }

  // JIKA ADMIN DENGAN TAMPILAN SEGMENTED CONTROL (TIDAK ADA DROPDOWN, TIDAK BISA TERPOTONG)
  if (variant === 'segmented') {
    return (
      <div className={`inline-flex flex-col gap-1 ${className}`}>
        {toastMessage && (
          <div className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 inline-flex items-center gap-1 animate-in fade-in duration-150">
            <Check className="w-3 h-3 text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-300 shadow-2xs gap-1">
          {/* Opsi 1: Siswa Aktif */}
          <button
            type="button"
            onClick={() => handleSelectSetting('aktif')}
            disabled={isUpdating}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentSetting === 'aktif'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
            title="Akun User / Wali Kelas hanya menampilkan siswa aktif"
          >
            <UserCheck className={`w-3.5 h-3.5 ${currentSetting === 'aktif' ? 'text-white' : 'text-emerald-600'}`} />
            <span>Siswa Aktif</span>
          </button>

          {/* Opsi 2: Siswa Tidak Aktif */}
          <button
            type="button"
            onClick={() => handleSelectSetting('tidak_aktif')}
            disabled={isUpdating}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentSetting === 'tidak_aktif'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
            title="Akun User / Wali Kelas hanya menampilkan siswa tidak aktif / mutasi / keluar"
          >
            <UserX className={`w-3.5 h-3.5 ${currentSetting === 'tidak_aktif' ? 'text-white' : 'text-rose-600'}`} />
            <span>Tidak Aktif</span>
          </button>

          {/* Opsi 3: Keduanya / Semua Siswa */}
          <button
            type="button"
            onClick={() => handleSelectSetting('semua')}
            disabled={isUpdating}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentSetting === 'semua'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
            title="Akun User / Wali Kelas menampilkan keduanya (semua siswa aktif & tidak aktif)"
          >
            <Users className={`w-3.5 h-3.5 ${currentSetting === 'semua' ? 'text-white' : 'text-indigo-600'}`} />
            <span>Semua</span>
          </button>
        </div>
      </div>
    );
  }

  // JIKA ADMIN DENGAN TAMPILAN TOOLBAR / DROPDOWN DENGAN SMART POSITIONING (ANTI-TERPOTONG)
  return (
    <div className={`relative inline-block ${className}`}>
      {toastMessage && (
        <div className="absolute -top-10 left-0 right-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-slate-900/90 backdrop-blur-md text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg border border-slate-700/50 animate-in fade-in slide-in-from-bottom-2 duration-200 whitespace-nowrap">
            {toastMessage}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            ref={dropdownButtonRef}
            type="button"
            onClick={handleToggleDropdown}
            disabled={isUpdating}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border shadow-xs transition-all duration-150 cursor-pointer ${
              showDropdown
                ? 'bg-slate-100 border-slate-400 text-slate-800'
                : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700 hover:border-slate-400'
            } focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20`}
            title="Atur status siswa yang dapat dilihat oleh akun User/Wali Kelas di Biodata Siswa dan Verval PD"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline text-slate-500 font-normal">Akses Status (User):</span>
            <span className="flex items-center gap-1.5 font-bold text-slate-800">
              <span className={`w-2 h-2 rounded-full ${activeInfo.dotBg}`}></span>
              {activeInfo.shortTitle || activeInfo.title}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu Pengaturan dengan Smart Positioning */}
          {showDropdown && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowDropdown(false)} 
              />
              <div 
                className={`absolute left-0 sm:right-0 sm:left-auto w-72 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150 ${
                  openUpward ? 'bottom-full mb-2' : 'top-full mt-1.5'
                }`}
              >
                <div className="px-3 py-1.5 border-b border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Pengaturan Akun User / Wali Kelas
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pilih status siswa yang diizinkan tampil di menu Biodata &amp; Verval PD:
                  </p>
                </div>

                <div className="p-1 space-y-1">
                  {/* Opsi 1: Siswa Aktif Saja */}
                  <button
                    type="button"
                    onClick={() => handleSelectSetting('aktif')}
                    className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      currentSetting === 'aktif'
                        ? 'bg-emerald-50 text-emerald-900 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="p-1 rounded-md bg-white border border-slate-200 text-emerald-600 mt-0.5 shadow-2xs">
                      <UserCheck className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">Siswa Aktif Saja</span>
                        {currentSetting === 'aktif' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                        Menampilkan hanya siswa aktif (tidak aktif disembunyikan).
                      </p>
                    </div>
                  </button>

                  {/* Opsi 2: Siswa Tidak Aktif Saja */}
                  <button
                    type="button"
                    onClick={() => handleSelectSetting('tidak_aktif')}
                    className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      currentSetting === 'tidak_aktif'
                        ? 'bg-rose-50 text-rose-900 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="p-1 rounded-md bg-white border border-slate-200 text-rose-600 mt-0.5 shadow-2xs">
                      <UserX className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">Siswa Tidak Aktif Saja</span>
                        {currentSetting === 'tidak_aktif' && <Check className="w-3.5 h-3.5 text-rose-600" />}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                        Menampilkan hanya siswa tidak aktif / mutasi / keluar.
                      </p>
                    </div>
                  </button>

                  {/* Opsi 3: Keduanya (Semua Siswa) */}
                  <button
                    type="button"
                    onClick={() => handleSelectSetting('semua')}
                    className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      currentSetting === 'semua'
                        ? 'bg-blue-50 text-blue-900 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="p-1 rounded-md bg-white border border-slate-200 text-blue-600 mt-0.5 shadow-2xs">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">Keduanya (Semua Siswa)</span>
                        {currentSetting === 'semua' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                        Menampilkan seluruh data siswa (aktif dan tidak aktif).
                      </p>
                    </div>
                  </button>
                </div>

                <div className="px-3 pt-2 pb-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Berlaku di: Biodata &amp; Verval PD</span>
                  <span className="font-medium text-indigo-600">Admin Mode</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
