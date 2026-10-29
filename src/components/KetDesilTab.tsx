import React, { useState, useEffect, useMemo } from 'react';
import { Student, AppConfig, GTKData, WaliKelas, DesilData, DESIL_OPTIONS, KET_PIP_OPTIONS } from '../types';
import { fetchDesilDirectly, saveDesilDirectly, syncAllDesilDirectly, LOCAL_STORAGE_DESIL_KEY } from '../services/sheetsSync';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { isAdminRole, isUserRole, getWaliKelasForUser } from '../utils/authUtils';
import { 
  Sparkles, 
  Search, 
  Download, 
  Upload, 
  RefreshCw, 
  Check, 
  X, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Users, 
  FileSpreadsheet,
  CheckCircle2,
  Info,
  UserCheck,
  FileCode
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { CodeGsModal } from './CodeGsModal';

interface KetDesilTabProps {
  students: Student[];
  appConfig: AppConfig;
  currentUser?: GTKData | null;
  waliKelasList?: WaliKelas[];
  showToast?: (message: string) => void;
}

// Helper normalisasi nama rombel/kelas
const cleanClass = (str?: string) => (str || '').trim().toUpperCase().replace(/\s+/g, ' ');

// Helper normalisasi rombel untuk toleransi variasi penulisan Dapodik (misal: "X TKJ 1" vs "10 TKJ 1" vs "Kelas X TKJ 1")
export const normalizeRombel = (str?: string): string => {
  if (!str) return '';
  let s = String(str).trim().toUpperCase();
  s = s.replace(/^(KELAS|TINGKAT|ROMBEL)\s+/i, '');
  s = s.replace(/^XII\b/i, '12')
       .replace(/^XI\b/i, '11')
       .replace(/^X\b/i, '10');
  return s.replace(/[^A-Z0-9]/g, '');
};

export const isRombelMatch = (rombelA?: string, rombelB?: string): boolean => {
  if (!rombelA || !rombelB) return false;
  const cleanA = cleanClass(rombelA);
  const cleanB = cleanClass(rombelB);
  if (cleanA === cleanB) return true;
  const normA = normalizeRombel(rombelA);
  const normB = normalizeRombel(rombelB);
  return Boolean(normA && normB && normA === normB);
};

// Helper membersihkan NISN untuk perbandingan
const cleanNisn = (val?: string | number) => String(val || '').trim().replace(/[^0-9]/g, '');

/**
 * Helper mengecek apakah peserta didik berstatus aktif.
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

// Warna badge untuk masing-masing desil
const getDesilBadgeColor = (desil?: string) => {
  const d = String(desil || '').trim().toLowerCase();
  switch (d) {
    case 'desil 1':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    case 'desil 2':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'desil 3':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'desil 4':
      return 'bg-sky-100 text-sky-800 border-sky-300';
    case 'desil 5':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'yatim piatu':
      return 'bg-purple-100 text-purple-800 border-purple-300';
    default:
      return 'bg-white text-slate-500 border-slate-300';
  }
};

// Warna badge untuk keterangan PIP
const getKetPipBadgeColor = (ket?: string) => {
  const k = String(ket || '').trim().toLowerCase();
  if (k.includes('sudah')) {
    return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  }
  if (k.includes('belum')) {
    return 'bg-amber-100 text-amber-800 border-amber-300';
  }
  return 'bg-white text-slate-500 border-slate-300';
};

export const KetDesilTab: React.FC<KetDesilTabProps> = ({
  students,
  appConfig,
  currentUser,
  waliKelasList = [],
  showToast
}) => {
  const isAdmin = !currentUser || !isUserRole(currentUser) || isAdminRole(currentUser);

  // Deteksi penugasan wali kelas pengguna yang sedang login
  const userWaliKelas = useMemo(() => {
    const fromUtil = getWaliKelasForUser(currentUser, waliKelasList);
    if (fromUtil) return fromUtil;

    if (!currentUser) return null;

    // Cek field langsung pada currentUser
    const directKelas = (
      (currentUser as any).kelas || 
      (currentUser as any).rombel || 
      (currentUser as any).waliKelas || 
      (currentUser as any).wali_kelas || 
      ''
    ).toString().trim();
    if (directKelas) {
      return {
        kelas: directKelas,
        nama: currentUser.nama || '',
        nip: currentUser.nip || ''
      };
    }

    // Cek tugasTambahan
    const tugas = String(currentUser.tugasTambahan || (currentUser as any).tugas_tambahan || '').trim();
    if (tugas && /wali\s*kelas/i.test(tugas)) {
      const match = tugas.match(/wali\s*kelas\s*:?\s*(.+)/i);
      if (match && match[1]) {
        return {
          kelas: match[1].trim(),
          nama: currentUser.nama || '',
          nip: currentUser.nip || ''
        };
      }
    }

    return null;
  }, [currentUser, waliKelasList]);

  // Jika pengguna adalah wali kelas, kunci filter ke rombelnya
  const isWaliKelas = Boolean(userWaliKelas);
  const assignedKelas = userWaliKelas?.kelas ? userWaliKelas.kelas.trim() : '';
  const isWaliKelasOnly = isWaliKelas && (!currentUser || isUserRole(currentUser) || !isAdminRole(currentUser));

  // State data desil dari sheet "desil"
  const [desilList, setDesilList] = useState<DesilData[]>(() => {
    return safeGetItem<DesilData[]>(LOCAL_STORAGE_DESIL_KEY, []);
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [savingNisn, setSavingNisn] = useState<string | null>(null);
  const [justSavedNisn, setJustSavedNisn] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [filterKelas, setFilterKelas] = useState<string>(() => {
    return assignedKelas || 'all';
  });

  useEffect(() => {
    if (assignedKelas) {
      setFilterKelas(assignedKelas);
    }
  }, [assignedKelas]);

  const [filterDesil, setFilterDesil] = useState<string>('all');
  const [filterKetPip, setFilterKetPip] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  // Filter hanya menampilkan siswa aktif (default: true)
  const [onlyActive, setOnlyActive] = useState<boolean>(true);

  // Modal Impor Desil
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importRows, setImportRows] = useState<Array<{ nisn: string; desil: string; ket_pip: string; nama?: string; status: 'match' | 'unknown' }>>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [isProcessingImport, setIsProcessingImport] = useState<boolean>(false);
  const [isCodeGsModalOpen, setIsCodeGsModalOpen] = useState<boolean>(false);

  // Local toast jika showToast dari parent tidak tersedia
  const [localToast, setLocalToast] = useState<string | null>(null);
  const triggerToast = (msg: string) => {
    if (showToast) {
      showToast(msg);
    } else {
      setLocalToast(msg);
      setTimeout(() => setLocalToast(null), 4000);
    }
  };

  // Muat data desil saat komponen dibuka
  const loadDesilData = async (forceRefresh: boolean = false) => {
    setIsLoading(true);
    try {
      const data = await fetchDesilDirectly(appConfig.webAppUrl, appConfig.spreadsheetId, forceRefresh);
      if (data && Array.isArray(data)) {
        setDesilList(data);
        if (forceRefresh) {
          triggerToast(`Data Keterangan Desil & PIP berhasil diperbarui (${data.length} baris)`);
        }
      }
    } catch (err: any) {
      console.warn('Gagal memuat data desil:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDesilData(false);
  }, [appConfig.webAppUrl, appConfig.spreadsheetId]);

  // Lookup map NISN -> Student dari sheet "data"
  const studentByNisnMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((s) => {
      if (s.nisn) {
        map.set(String(s.nisn).trim(), s);
        const clean = cleanNisn(s.nisn);
        if (clean) map.set(clean, s);
      }
    });
    return map;
  }, [students]);

  // Lookup map NISN -> Data Desil & Ket PIP
  const desilDataMap = useMemo(() => {
    const map = new Map<string, { desil: string; ket_pip: string }>();
    desilList.forEach((d) => {
      if (d.nisn) {
        const itemVal = {
          desil: String(d.desil || '').trim(),
          ket_pip: String(d.ket_pip || '').trim()
        };
        map.set(String(d.nisn).trim(), itemVal);
        const clean = cleanNisn(d.nisn);
        if (clean) map.set(clean, itemVal);
      }
    });
    return map;
  }, [desilList]);

  // Daftar opsi kelas/rombel yang unik (hanya dari siswa aktif jika filter aktif menyala)
  const uniqueKelasList = useMemo(() => {
    const set = new Set<string>();
    const sourceList = onlyActive ? students.filter(isStudentActive) : students;
    sourceList.forEach((s) => {
      const k = cleanClass(s.kelas);
      if (k) set.add(k);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  }, [students, onlyActive]);

  // Menggabungkan siswa sheet "data" dengan data sheet "desil" (hanya siswa aktif jika onlyActive = true)
  const combinedData = useMemo(() => {
    const allNisns = new Set<string>();
    const resultList: Array<{
      nisn: string;
      nama: string;
      rombel: string;
      desil: string;
      ket_pip: string;
      studentObj?: Student;
      isAktif: boolean;
    }> = [];

    // Filter sumber siswa berdasarkan status aktif
    const eligibleStudents = onlyActive ? students.filter(isStudentActive) : students;

    // 1. Siswa dari sheet "data"
    eligibleStudents.forEach((s) => {
      const sNisn = String(s.nisn || '').trim();
      if (!sNisn) return;
      allNisns.add(sNisn);
      const clean = cleanNisn(sNisn);
      if (clean) allNisns.add(clean);

      const dObj = desilDataMap.get(sNisn) || (clean ? desilDataMap.get(clean) : undefined);
      resultList.push({
        nisn: sNisn,
        nama: s.nama || '-',
        rombel: s.kelas || '-',
        desil: dObj?.desil || '',
        ket_pip: dObj?.ket_pip || '',
        studentObj: s,
        isAktif: isStudentActive(s)
      });
    });

    // 2. Baris dari sheet "desil" yang mungkin belum ada di sheet "data"
    desilList.forEach((d) => {
      const dNisn = String(d.nisn || '').trim();
      const clean = cleanNisn(dNisn);
      if (dNisn && !allNisns.has(dNisn) && (!clean || !allNisns.has(clean))) {
        const matchStudent = studentByNisnMap.get(dNisn) || (clean ? studentByNisnMap.get(clean) : undefined);

        // Jika filter hanya siswa aktif aktif, dan siswa ini terdata tapi statusnya tidak aktif, abaikan
        if (onlyActive && matchStudent && !isStudentActive(matchStudent)) {
          return;
        }

        allNisns.add(dNisn);
        if (clean) allNisns.add(clean);
        resultList.push({
          nisn: dNisn,
          nama: matchStudent?.nama || d.nama || 'Siswa Baru (Belum Terdata)',
          rombel: matchStudent?.kelas || d.rombel || '-',
          desil: String(d.desil || '').trim(),
          ket_pip: String(d.ket_pip || '').trim(),
          studentObj: matchStudent,
          isAktif: matchStudent ? isStudentActive(matchStudent) : true
        });
      }
    });

    return resultList;
  }, [students, desilList, desilDataMap, studentByNisnMap, onlyActive]);

  // Filter Data
  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cleanQ = cleanNisn(q);

    return combinedData.filter((item) => {
      // Filter hak akses Wali Kelas yang sedang login
      if (isWaliKelasOnly && assignedKelas) {
        if (!isRombelMatch(item.rombel, assignedKelas)) return false;
      } else if (filterKelas !== 'all') {
        if (!isRombelMatch(item.rombel, filterKelas)) return false;
      }

      // Filter Keterangan Desil
      if (filterDesil === 'filled' && !item.desil) return false;
      if (filterDesil === 'empty' && Boolean(item.desil)) return false;
      if (filterDesil !== 'all' && filterDesil !== 'filled' && filterDesil !== 'empty') {
        if (item.desil.toLowerCase() !== filterDesil.toLowerCase()) return false;
      }

      // Filter Keterangan PIP
      if (filterKetPip === 'filled' && !item.ket_pip) return false;
      if (filterKetPip === 'empty' && Boolean(item.ket_pip)) return false;
      if (filterKetPip !== 'all' && filterKetPip !== 'filled' && filterKetPip !== 'empty') {
        if (item.ket_pip.toLowerCase() !== filterKetPip.toLowerCase()) return false;
      }

      // Pencarian
      if (q) {
        const matchNama = item.nama.toLowerCase().includes(q);
        const matchNisn = item.nisn.toLowerCase().includes(q) || (cleanQ && cleanNisn(item.nisn).includes(cleanQ));
        const matchRombel = item.rombel.toLowerCase().includes(q);
        const matchDesil = item.desil.toLowerCase().includes(q);
        const matchPip = item.ket_pip.toLowerCase().includes(q);
        if (!matchNama && !matchNisn && !matchRombel && !matchDesil && !matchPip) return false;
      }

      return true;
    });
  }, [combinedData, isWaliKelasOnly, assignedKelas, filterKelas, filterDesil, filterKetPip, search]);

  // Statistik Desil & PIP
  const stats = useMemo(() => {
    const baseList = isWaliKelasOnly && assignedKelas
      ? combinedData.filter((i) => isRombelMatch(i.rombel, assignedKelas))
      : (filterKelas !== 'all' ? combinedData.filter((i) => isRombelMatch(i.rombel, filterKelas)) : combinedData);

    const total = baseList.length;
    let filledDesil = 0;
    let sudahPip = 0;
    let belumPip = 0;
    const counts: Record<string, number> = {
      'desil 1': 0,
      'desil 2': 0,
      'desil 3': 0,
      'desil 4': 0,
      'desil 5': 0,
      'yatim piatu': 0
    };

    baseList.forEach((i) => {
      const d = i.desil.toLowerCase();
      if (d) {
        filledDesil++;
        if (counts[d] !== undefined) {
          counts[d]++;
        }
      }
      const p = i.ket_pip.toLowerCase();
      if (p.includes('sudah')) sudahPip++;
      else if (p.includes('belum')) belumPip++;
    });

    return {
      total,
      filledDesil,
      emptyDesil: Math.max(0, total - filledDesil),
      sudahPip,
      belumPip,
      counts
    };
  }, [combinedData, isWaliKelasOnly, assignedKelas]);

  // Pagination
  const totalItems = filteredData.length;
  const effectivePerPage = itemsPerPage === -1 ? totalItems : itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / (effectivePerPage || 1)));
  const paginatedData = useMemo(() => {
    if (itemsPerPage === -1) return filteredData;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  // Handler Perubahan Desil
  const handleDesilSelect = async (nisn: string, studentName: string, newDesil: string) => {
    const cleanId = String(nisn).trim();
    setSavingNisn(cleanId);

    // Update state desilList langsung
    setDesilList((prev) => {
      const next = [...prev];
      const idx = next.findIndex((d) => String(d.nisn).trim() === cleanId);
      if (idx >= 0) {
        next[idx] = { ...next[idx], desil: newDesil };
      } else {
        next.push({ nisn: cleanId, desil: newDesil, ket_pip: '' });
      }
      return next;
    });

    try {
      await saveDesilDirectly(appConfig.webAppUrl, cleanId, { desil: newDesil });
      setJustSavedNisn(cleanId);
      setTimeout(() => setJustSavedNisn(null), 2500);

      const labelDesil = newDesil ? `"${newDesil}"` : 'dikosongkan';
      triggerToast(`Desil untuk ${studentName || cleanId} berhasil disimpan: ${labelDesil}`);
    } catch (err: any) {
      triggerToast(`Data tersimpan lokal: ${err?.message || 'Gagal sinkron ke spreadsheet'}`);
    } finally {
      setSavingNisn(null);
    }
  };

  // Handler Perubahan Keterangan PIP (sudah dapat PIP / Belum Dapat PIP)
  const handleKetPipSelect = async (nisn: string, studentName: string, newKetPip: string) => {
    const cleanId = String(nisn).trim();
    setSavingNisn(cleanId);

    // Update state desilList langsung
    setDesilList((prev) => {
      const next = [...prev];
      const idx = next.findIndex((d) => String(d.nisn).trim() === cleanId);
      if (idx >= 0) {
        next[idx] = { ...next[idx], ket_pip: newKetPip };
      } else {
        next.push({ nisn: cleanId, desil: '', ket_pip: newKetPip });
      }
      return next;
    });

    try {
      await saveDesilDirectly(appConfig.webAppUrl, cleanId, { ket_pip: newKetPip });
      setJustSavedNisn(cleanId);
      setTimeout(() => setJustSavedNisn(null), 2500);

      const labelPip = newKetPip ? `"${newKetPip}"` : 'dikosongkan';
      triggerToast(`Ket. PIP untuk ${studentName || cleanId} berhasil disimpan: ${labelPip}`);
    } catch (err: any) {
      triggerToast(`Data tersimpan lokal: ${err?.message || 'Gagal sinkron ke spreadsheet'}`);
    } finally {
      setSavingNisn(null);
    }
  };

  // Unduh Excel Data Desil & Ket. PIP
  const handleDownloadExcel = () => {
    if (filteredData.length === 0) {
      alert('Tidak ada data keterangan desil untuk diunduh.');
      return;
    }

    const exportRows = filteredData.map((item, idx) => ({
      'No': idx + 1,
      'NISN': item.nisn,
      'Nama': item.nama,
      'Kelas': item.rombel,
      'Desil': item.desil || '',
      'Ket_PIP': item.ket_pip || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 16 },
      { wch: 35 },
      { wch: 18 },
      { wch: 20 },
      { wch: 22 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ket Desil');
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Keterangan_Desil_PIP_SMKN1_Palopo_${dateStr}.xlsx`);
  };

  // Handler Baca File Impor Excel / CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws);

        if (!rawJson || rawJson.length === 0) {
          alert('File Excel kosong atau format tidak sesuai.');
          return;
        }

        const parsedRows: Array<{ nisn: string; desil: string; ket_pip: string; nama?: string; status: 'match' | 'unknown' }> = [];

        rawJson.forEach((row) => {
          let nisnVal = '';
          let desilVal = '';
          let ketPipVal = '';

          // Cari kolom nisn, desil, & ket_pip dengan toleransi penamaan
          Object.keys(row).forEach((k) => {
            const kClean = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (kClean === 'nisn') nisnVal = String(row[k] || '').trim();
            if (kClean === 'desil' || kClean === 'keterangandesil' || kClean === 'ketdesil') {
              desilVal = String(row[k] || '').trim();
            }
            if (kClean === 'ketpip' || kClean === 'keteranganpip' || kClean === 'pip' || kClean === 'statuspip') {
              ketPipVal = String(row[k] || '').trim();
            }
          });

          // Fallback ke kolom urut jika header tidak bernama 'nisn' / 'desil'
          if (!nisnVal) {
            const keys = Object.keys(row);
            if (keys[0]) nisnVal = String(row[keys[0]] || '').trim();
            if (!desilVal && keys[1]) desilVal = String(row[keys[1]] || '').trim();
            if (!ketPipVal && keys[2]) ketPipVal = String(row[keys[2]] || '').trim();
          }

          if (nisnVal) {
            const clean = cleanNisn(nisnVal);
            const matchedStudent = studentByNisnMap.get(nisnVal) || (clean ? studentByNisnMap.get(clean) : undefined);
            parsedRows.push({
              nisn: nisnVal,
              desil: desilVal,
              ket_pip: ketPipVal,
              nama: matchedStudent?.nama || row['nama'] || row['Nama'] || '',
              status: matchedStudent ? 'match' : 'unknown'
            });
          }
        });

        if (parsedRows.length === 0) {
          alert('Tidak ditemukan data baris atau kolom "nisn" yang valid di dalam file.');
          return;
        }

        setImportRows(parsedRows);
        setIsImportModalOpen(true);
      } catch (err: any) {
        alert('Gagal membaca file Excel: ' + (err?.message || err));
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Terapkan hasil impor
  const handleApplyImport = async () => {
    if (importRows.length === 0) return;
    setIsProcessingImport(true);

    try {
      const itemsToSync: DesilData[] = importRows.map((r) => ({
        nisn: r.nisn,
        desil: r.desil,
        ket_pip: r.ket_pip
      }));

      // Merge dengan desilList yang ada
      const map = new Map<string, { desil: string; ket_pip: string }>();
      desilList.forEach((d) => {
        if (d.nisn) map.set(cleanNisn(d.nisn) || d.nisn, { desil: d.desil || '', ket_pip: d.ket_pip || '' });
      });
      itemsToSync.forEach((it) => {
        if (it.nisn) {
          const key = cleanNisn(it.nisn) || it.nisn;
          const prev = map.get(key) || { desil: '', ket_pip: '' };
          map.set(key, {
            desil: it.desil !== undefined && it.desil !== '' ? it.desil : prev.desil,
            ket_pip: it.ket_pip !== undefined && it.ket_pip !== '' ? it.ket_pip : prev.ket_pip
          });
        }
      });

      const updatedList: DesilData[] = Array.from(map.entries()).map(([k, val]) => {
        const found = itemsToSync.find((x) => cleanNisn(x.nisn) === k) || desilList.find((x) => cleanNisn(x.nisn) === k);
        return {
          nisn: found?.nisn || k,
          desil: val.desil,
          ket_pip: val.ket_pip
        };
      });

      setDesilList(updatedList);
      safeSetItem(LOCAL_STORAGE_DESIL_KEY, updatedList);

      const res = await syncAllDesilDirectly(appConfig.webAppUrl, updatedList, 'merge');
      triggerToast(`Sukses: ${res.message} (${importRows.length} data diimpor)`);
      setIsImportModalOpen(false);
      setImportRows([]);
    } catch (err: any) {
      triggerToast(`Tersimpan lokal: ${err?.message || 'Gagal sinkron ke spreadsheet'}`);
      setIsImportModalOpen(false);
    } finally {
      setIsProcessingImport(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast Lokal jika tidak ada showToast dari parent */}
      {localToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-medium bg-slate-900 text-white animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-indigo-400" />
          <span>{localToast}</span>
        </div>
      )}

      {/* Bar Header & Pencarian */}
      <div className="bg-white p-4 lg:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" /> Keterangan Desil & PIP
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pilih keterangan desil dan status penerimaan PIP untuk masing-masing peserta didik. Data tersimpan di sheet <strong>desil</strong>.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
              onlyActive 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{onlyActive ? `Hanya Menampilkan Siswa Aktif (${combinedData.length} siswa)` : `Menampilkan Semua Siswa (${combinedData.length} siswa)`}</span>
            </span>
            {isWaliKelasOnly && userWaliKelas && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold shadow-2xs">
                <Users className="w-3.5 h-3.5" />
                <span>Wali Kelas: <strong>{userWaliKelas.nama || currentUser?.nama}</strong> &bull; Rombel <strong>{userWaliKelas.kelas}</strong> ({filteredData.length} siswa)</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Pencarian */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari nama, NISN, rombel..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Toggle Siswa Aktif */}
          <button
            type="button"
            onClick={() => {
              setOnlyActive(!onlyActive);
              setCurrentPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              onlyActive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
            }`}
            title={onlyActive ? 'Klik untuk menampilkan semua siswa termasuk non-aktif/keluar' : 'Klik untuk hanya menampilkan siswa aktif'}
          >
            <UserCheck className={`w-3.5 h-3.5 ${onlyActive ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>{onlyActive ? 'Siswa Aktif Saja' : 'Semua Siswa'}</span>
          </button>

          {/* Filter Rombel (Khusus Admin / Non-Wali Kelas) */}
          {!isWaliKelasOnly && (
            <div className="relative">
              <select
                value={filterKelas}
                onChange={(e) => {
                  setFilterKelas(e.target.value);
                  setCurrentPage(1);
                }}
                className="py-2 pl-3 pr-8 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none"
              >
                <option value="all">Semua Rombel ({uniqueKelasList.length})</option>
                {uniqueKelasList.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <Filter className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Filter Status Desil */}
          <div className="relative">
            <select
              value={filterDesil}
              onChange={(e) => {
                setFilterDesil(e.target.value);
                setCurrentPage(1);
              }}
              className="py-2 pl-3 pr-8 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none"
            >
              <option value="all">Semua Desil ({stats.total})</option>
              <option value="filled">Sudah Ditentukan ({stats.filledDesil})</option>
              <option value="empty">Belum Ditentukan ({stats.emptyDesil})</option>
              <option disabled>──────────</option>
              {DESIL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} ({stats.counts[opt] || 0})
                </option>
              ))}
            </select>
            <Filter className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Filter Status PIP */}
          <div className="relative">
            <select
              value={filterKetPip}
              onChange={(e) => {
                setFilterKetPip(e.target.value);
                setCurrentPage(1);
              }}
              className="py-2 pl-3 pr-8 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none"
            >
              <option value="all">Semua Status PIP</option>
              <option value="sudah dapat PIP">Sudah Dapat PIP ({stats.sudahPip})</option>
              <option value="Belum Dapat PIP">Belum Dapat PIP ({stats.belumPip})</option>
              <option value="empty">Belum Dipilih ({Math.max(0, stats.total - stats.sudahPip - stats.belumPip)})</option>
            </select>
            <Filter className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Segarkan */}
          <button
            onClick={() => loadDesilData(true)}
            disabled={isLoading}
            title="Segarkan data dari sheet desil"
            className="p-2 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {/* Smart Impor Desil (Khusus Admin) */}
          {isAdmin && (
            <label className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition-all">
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>Smart Impor</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}

          {/* Unduh Excel */}
          <button
            onClick={handleDownloadExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Excel</span>
          </button>
        </div>
      </div>

      {/* Ringkasan Status Desil & PIP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Total Siswa</div>
          <div className="text-lg font-bold text-slate-800 mt-0.5">{stats.total}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Sudah Terisi Desil</div>
          <div className="text-lg font-bold text-emerald-600 mt-0.5">{stats.filledDesil}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Belum Terisi Desil</div>
          <div className="text-lg font-bold text-rose-500 mt-0.5">{stats.emptyDesil}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Sudah Dapat PIP</div>
          <div className="text-lg font-bold text-emerald-700 mt-0.5">{stats.sudahPip}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Belum Dapat PIP</div>
          <div className="text-lg font-bold text-amber-700 mt-0.5">{stats.belumPip}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Desil 1 s.d. 3</div>
          <div className="text-lg font-bold text-indigo-700 mt-0.5">
            {(stats.counts['desil 1'] || 0) + (stats.counts['desil 2'] || 0) + (stats.counts['desil 3'] || 0)}
          </div>
        </div>
      </div>

      {/* Tabel Bersih Keterangan Desil & PIP */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4 w-32">NISN</th>
                <th className="py-3 px-4 min-w-[200px]">Nama Peserta Didik</th>
                <th className="py-3 px-4 w-28">Rombel</th>
                <th className="py-3 px-4 min-w-[190px]">Keterangan Desil</th>
                <th className="py-3 px-4 min-w-[190px]">Ket. PIP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Info className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-medium text-sm text-slate-600">Tidak ada data peserta didik yang cocok.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {search ? 'Coba gunakan kata kunci pencarian yang berbeda.' : 'Pastikan data peserta didik di sheet "data" telah terisi.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, idx) => {
                  const rowNumber = (currentPage - 1) * (itemsPerPage === -1 ? 0 : itemsPerPage) + idx + 1;
                  const isCurrentSaving = savingNisn === item.nisn;
                  const isJustSaved = justSavedNisn === item.nisn;

                  return (
                    <tr 
                      key={item.nisn} 
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isJustSaved ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-medium text-slate-500">
                        {rowNumber}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-700">
                        {item.nisn}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <span>{item.nama}</span>
                          {!item.isAktif && (
                            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">
                              Tidak Aktif
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {item.rombel}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <select
                            value={item.desil || ''}
                            onChange={(e) => handleDesilSelect(item.nisn, item.nama, e.target.value)}
                            disabled={isCurrentSaving}
                            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${
                              item.desil 
                                ? getDesilBadgeColor(item.desil)
                                : 'bg-white border-slate-300 text-slate-500'
                            } ${isCurrentSaving ? 'opacity-50 cursor-wait' : ''}`}
                          >
                            <option value="" className="bg-white text-slate-400 font-normal">
                              - Belum Dipilih -
                            </option>
                            {DESIL_OPTIONS.map((opt) => (
                              <option key={opt} value={opt} className="bg-white text-slate-800 font-medium">
                                {opt}
                              </option>
                            ))}
                          </select>

                          {isCurrentSaving && (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                          )}
                          {isJustSaved && !isCurrentSaving && (
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 animate-in zoom-in duration-150" />
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <select
                          value={item.ket_pip || ''}
                          onChange={(e) => handleKetPipSelect(item.nisn, item.nama, e.target.value)}
                          disabled={isCurrentSaving}
                          className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${
                            getKetPipBadgeColor(item.ket_pip)
                          } ${isCurrentSaving ? 'opacity-50 cursor-wait' : ''}`}
                        >
                          <option value="" className="bg-white text-slate-400 font-normal">
                            - Belum Dipilih -
                          </option>
                          {KET_PIP_OPTIONS.map((opt) => (
                            <option key={opt} value={opt} className="bg-white text-slate-800 font-medium">
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3.5 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Menampilkan</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="py-1 px-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 font-medium cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={-1}>Semua ({totalItems})</option>
            </select>
            <span>dari <strong>{totalItems}</strong> peserta didik</span>
          </div>

          {itemsPerPage !== -1 && totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 border border-slate-300 bg-white rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium text-slate-700">
                Halaman {currentPage} dari {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 border border-slate-300 bg-white rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Preview Impor Keterangan Desil & PIP */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Preview Impor Keterangan Desil & PIP
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  File: <strong>{importFileName}</strong> &bull; Ditemukan {importRows.length} data untuk diimpor.
                </p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  Perubahan akan diterapkan pada sheet <strong>desil</strong> di spreadsheet (header: <code>nisn</code>, <code>desil</code>, <code>ket_pip</code>). Data yang cocok berdasarkan NISN akan diperbarui.
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">No</th>
                      <th className="py-2.5 px-3">NISN</th>
                      <th className="py-2.5 px-3">Nama (Sheet Data)</th>
                      <th className="py-2.5 px-3">Keterangan Desil</th>
                      <th className="py-2.5 px-3">Ket. PIP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importRows.slice(0, 30).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-center text-slate-400">{i + 1}</td>
                        <td className="py-2 px-3 font-mono font-medium text-slate-700">{row.nisn}</td>
                        <td className="py-2 px-3 text-slate-800">{row.nama || '-'}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getDesilBadgeColor(row.desil)}`}>
                            {row.desil || '-'}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getKetPipBadgeColor(row.ket_pip)}`}>
                            {row.ket_pip || '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importRows.length > 30 && (
                <p className="text-center text-xs text-slate-400">
                  ... dan {importRows.length - 30} baris lainnya
                </p>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isProcessingImport}
                className="px-3.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-white bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyImport}
                disabled={isProcessingImport}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isProcessingImport ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan ke Spreadsheet...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Terapkan & Simpan ({importRows.length} data)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Script code.gs Terbaru */}
      <CodeGsModal
        isOpen={isCodeGsModalOpen}
        onClose={() => setIsCodeGsModalOpen(false)}
        webAppUrl={appConfig.webAppUrl || ''}
        onSaveWebAppUrl={(url) => {
          if (appConfig) appConfig.webAppUrl = url;
        }}
      />
    </div>
  );
};
