import { Student } from '../types';
import { safeGetItem, safeSetItem } from './storage';

export type StudentStatusFilterSetting = 'aktif' | 'tidak_aktif' | 'semua';

export const LOCAL_STORAGE_STUDENT_STATUS_FILTER_KEY = 'dapodik_user_student_status_filter';

/**
 * Helper terpusat untuk mendeteksi apakah peserta didik berstatus aktif.
 * Mengabaikan siswa berstatus Tidak Aktif, Keluar, Mutasi, Mengundurkan Diri, Lulus, Wafat, dsb.
 */
export const isStudentActive = (s?: Student | null): boolean => {
  if (!s) return false;

  // 1. Cek field status (default jika kosong dianggap 'Aktif')
  const st = String(s.status || 'Aktif').trim().toLowerCase();
  if (
    st === 'tidak aktif' ||
    st.includes('tidak') ||
    st.includes('non') ||
    st === 'keluar' ||
    st === 'mutasi' ||
    st === 'lulus' ||
    st === 'mengundurkan diri' ||
    st === 'dikeluarkan' ||
    st === 'putus sekolah' ||
    st === 'wafat' ||
    st === 'hilang'
  ) {
    return false;
  }

  // 2. Cek field statusRegistrasi jika terisi
  const reg = String(s.statusRegistrasi || '').trim().toLowerCase();
  if (reg === 'keluar' || reg === 'lulus' || reg === 'mutasi') {
    return false;
  }

  // 3. Cek field ket (keterangan mutasi keluar)
  const ket = String(s.ket || '').trim().toLowerCase();
  if (ket && ket !== '-' && ket !== 'aktif') {
    if (
      ket.includes('mutasi') ||
      ket.includes('keluar') ||
      ket.includes('dikeluarkan') ||
      ket.includes('undur') ||
      ket.includes('putus') ||
      ket.includes('wafat') ||
      ket.includes('meninggal') ||
      ket.includes('hilang') ||
      ket.includes('lulus')
    ) {
      return false;
    }
  }

  return true;
};

/**
 * Memfilter daftar siswa berdasarkan pengaturan status:
 * - 'aktif'       : hanya siswa yang aktif
 * - 'tidak_aktif' : hanya siswa yang tidak aktif (mutasi/keluar/lulus/dsb)
 * - 'semua'       : seluruh siswa (keduanya)
 */
export const filterStudentsByStatusSetting = (
  students: Student[],
  setting: StudentStatusFilterSetting
): Student[] => {
  if (!Array.isArray(students)) return [];
  if (setting === 'aktif') {
    return students.filter(isStudentActive);
  }
  if (setting === 'tidak_aktif') {
    return students.filter((s) => !isStudentActive(s));
  }
  return students;
};

/**
 * Mengambil pengaturan filter status siswa dari LocalStorage.
 * Default: 'semua' (atau 'aktif' sesuai kebutuhan)
 */
export const getCachedStudentStatusFilterSetting = (): StudentStatusFilterSetting => {
  const saved = safeGetItem<string>(LOCAL_STORAGE_STUDENT_STATUS_FILTER_KEY, 'semua');
  if (saved === 'aktif' || saved === 'tidak_aktif' || saved === 'semua') {
    return saved;
  }
  return 'semua';
};

/**
 * Menyimpan pengaturan ke LocalStorage dan membroadcast event ke seluruh jendela/komponen.
 */
export const saveStudentStatusFilterSettingLocally = (
  setting: StudentStatusFilterSetting
) => {
  safeSetItem(LOCAL_STORAGE_STUDENT_STATUS_FILTER_KEY, setting);
  try {
    window.dispatchEvent(
      new CustomEvent('dapodik_student_status_filter_changed', {
        detail: setting
      })
    );
  } catch {}
};

/**
 * Mengambil pengaturan filter status siswa dari server backend.
 */
export const fetchStudentStatusFilterFromServer = async (): Promise<StudentStatusFilterSetting> => {
  try {
    const res = await fetch('/api/config/student-filter', {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (
        data.status === 'success' &&
        (data.filter === 'aktif' || data.filter === 'tidak_aktif' || data.filter === 'semua')
      ) {
        saveStudentStatusFilterSettingLocally(data.filter);
        return data.filter;
      }
    }
  } catch (e) {
    // Abaikan jika offline / timeout, gunakan cached
  }
  return getCachedStudentStatusFilterSetting();
};

/**
 * Menyimpan pengaturan filter status siswa ke backend server dan lokal.
 */
export const updateStudentStatusFilterSettingOnServer = async (
  setting: StudentStatusFilterSetting
): Promise<{ ok: boolean; filter: StudentStatusFilterSetting; message?: string }> => {
  saveStudentStatusFilterSettingLocally(setting);
  try {
    const res = await fetch('/api/config/student-filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: setting }),
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const json = await res.json();
      return {
        ok: true,
        filter: json.filter || setting,
        message: json.message || 'Pengaturan status siswa untuk User/Wali Kelas berhasil disimpan'
      };
    }
  } catch (err: any) {
    console.warn('Gagal menyimpan filter status ke server:', err);
  }
  return {
    ok: true,
    filter: setting,
    message: 'Pengaturan tersimpan di browser'
  };
};
