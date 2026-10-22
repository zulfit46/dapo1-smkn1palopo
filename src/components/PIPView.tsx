import React, { useState, useEffect, useMemo } from 'react';
import { Student, AppConfig, GTKData, PIPData, WaliKelas } from '../types';
import { fetchPIPDirectly, savePIPDirectly, LOCAL_STORAGE_PIP_KEY } from '../services/sheetsSync';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { isAdminRole, isUserRole, getWaliKelasForUser } from '../utils/authUtils';
import { 
  GraduationCap, 
  Search, 
  Download, 
  RefreshCw, 
  Check, 
  X, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  CheckCircle2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Users,
  Settings,
  AlertTriangle,
  Lock,
  Power,
  PowerOff
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface PIPViewProps {
  students: Student[];
  appConfig: AppConfig;
  currentUser?: GTKData | null;
  waliKelasList?: WaliKelas[];
}

// Opsi Target Sasaran Tingkat Kelas (bisa memilih lebih dari 1)
export const OPSI_TARGET_SASARAN = [
  { id: '10', label: 'Kelas 10', badge: 'X', color: 'indigo' },
  { id: '11', label: 'Kelas 11', badge: 'XI', color: 'sky' },
  { id: '12', label: 'Kelas 12', badge: 'XII', color: 'violet' }
];

// Helper mendeteksi tingkat kelas dari rombel siswa (10, 11, atau 12)
export const getTingkatKelas = (rombel: string): '10' | '11' | '12' | 'lainnya' => {
  const clean = String(rombel || '').trim().toUpperCase();
  if (/^(10\b|X\b|KELAS 10|KELAS X)/i.test(clean) || clean.startsWith('10 ') || clean.startsWith('10-') || clean.startsWith('X ')) {
    return '10';
  }
  if (/^(11\b|XI\b|KELAS 11|KELAS XI)/i.test(clean) || clean.startsWith('11 ') || clean.startsWith('11-') || clean.startsWith('XI ')) {
    return '11';
  }
  if (/^(12\b|XII\b|KELAS 12|KELAS XII)/i.test(clean) || clean.startsWith('12 ') || clean.startsWith('12-') || clean.startsWith('XII ')) {
    return '12';
  }
  const match = clean.match(/^(10|11|12)/);
  if (match) return match[1] as '10' | '11' | '12';
  return 'lainnya';
};

// Daftar opsi alasan layak PIP (Desil 1-4 di urutan 1)
const OPSI_ALASAN_LAYAK = [
  'Desil 1-4',
  'Rentan Putus Sekolah',
  'Yatim dan atau Piatu',
  'Berada di Panti Asuhan/Sosial',
  'Berkebutuhan Khusus',
  'Orang Tua terdampak PHK',
  'Orang tua berstatus narapidana',
  'murid dalam binaan LPKA'
];

// Helper normalisasi nama rombel/kelas
const cleanClass = (str?: string) => (str || '').trim().toUpperCase().replace(/\s+/g, ' ');

export const PIPView: React.FC<PIPViewProps> = ({ 
  students, 
  appConfig, 
  currentUser,
  waliKelasList = []
}) => {
  const isAdmin = !currentUser || !isUserRole(currentUser) || isAdminRole(currentUser);

  // Deteksi penugasan wali kelas pengguna yang sedang login
  const userWaliKelas = useMemo(() => {
    return getWaliKelasForUser(currentUser, waliKelasList);
  }, [currentUser, waliKelasList]);

  // Jika bukan admin dan merupakan wali kelas, aktifkan filter otomatis sesuai rombelnya
  const isWaliKelasOnly = !isAdmin && Boolean(userWaliKelas);
  const assignedKelas = userWaliKelas?.kelas ? cleanClass(userWaliKelas.kelas) : '';

  const [pipList, setPipList] = useState<PIPData[]>(() => {
    return safeGetItem<PIPData[]>(LOCAL_STORAGE_PIP_KEY, []);
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'filled' | 'empty'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [sortField, setSortField] = useState<'default' | 'rombel' | 'nama' | 'nisn'>('default');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modal State untuk pemilihan alasan layak (Multi-select)
  const [selectedStudent, setSelectedStudent] = useState<PIPData | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Status Aktif/Nonaktif Usulan PIP
  const [isPipAktif, setIsPipAktif] = useState<boolean>(() => {
    const saved = safeGetItem<boolean>('dapodik_pip_aktif', true);
    return saved;
  });

  // Kuota Usulan PIP State
  const [kuota, setKuota] = useState<number>(() => safeGetItem<number>('dapodik_pip_kuota', 50));
  const [isEditingKuota, setIsEditingKuota] = useState<boolean>(false);
  const [tempKuota, setTempKuota] = useState<string>('50');

  // Target Sasaran Tingkat Kelas (Kelas 10, 11, 12 - bisa memilih lebih dari 1)
  const [targetSasaran, setTargetSasaran] = useState<string[]>(() => {
    const saved = safeGetItem<string[]>('dapodik_pip_target_sasaran', ['10', '11', '12']);
    return Array.isArray(saved) && saved.length > 0 ? saved : ['10', '11', '12'];
  });
  const [tempTargetSasaran, setTempTargetSasaran] = useState<string[]>(['10', '11', '12']);
  const [filterOnlyTarget, setFilterOnlyTarget] = useState<boolean>(true);

  // Ambil kuota, target sasaran, dan status aktif dari server saat komponen dimuat
  useEffect(() => {
    fetch('/api/pip/kuota')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.kuota === 'number') {
          setKuota(data.kuota);
          safeSetItem('dapodik_pip_kuota', data.kuota);
        }
        if (data && Array.isArray(data.targetSasaran) && data.targetSasaran.length > 0) {
          setTargetSasaran(data.targetSasaran);
          safeSetItem('dapodik_pip_target_sasaran', data.targetSasaran);
        }
        if (data && typeof data.aktif === 'boolean') {
          setIsPipAktif(data.aktif);
          safeSetItem('dapodik_pip_aktif', data.aktif);
        }
      })
      .catch(() => {});
  }, []);

  // Toggle status aktif/nonaktif usulan PIP
  const handleTogglePipAktif = async () => {
    const newStatus = !isPipAktif;
    setIsPipAktif(newStatus);
    safeSetItem('dapodik_pip_aktif', newStatus);
    
    if (newStatus) {
      showToast('Usulan PIP telah diaktifkan.');
    } else {
      showToast('Usulan PIP telah dinonaktifkan.');
    }

    try {
      await fetch('/api/pip/kuota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktif: newStatus })
      });
    } catch (err) {
      console.warn('Gagal menyimpan status ke server:', err);
    }
  };

  // Hitung jumlah usulan yang sudah terisi
  const totalTerusul = useMemo(() => {
    return pipList.filter(item => Boolean((item.alasan_layak || item.alasanLayak || '').trim())).length;
  }, [pipList]);

  // Toggle satu target sasaran (multi-select)
  const handleToggleSasaran = (tingkat: string) => {
    let next: string[];
    if (targetSasaran.includes(tingkat)) {
      if (targetSasaran.length <= 1) {
        showToast('Minimal 1 target sasaran kelas harus dipilih.');
        return;
      }
      next = targetSasaran.filter(t => t !== tingkat);
    } else {
      next = [...targetSasaran, tingkat].sort();
    }
    setTargetSasaran(next);
    safeSetItem('dapodik_pip_target_sasaran', next);
    showToast(`Target sasaran diperbarui: ${next.map(t => `Kelas ${t}`).join(', ')}`);
    fetch('/api/pip/kuota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetSasaran: next })
    }).catch(() => {});
  };

  // Pilih semua target sasaran (Kelas 10, 11, 12)
  const handleSelectAllSasaran = () => {
    const all = ['10', '11', '12'];
    setTargetSasaran(all);
    safeSetItem('dapodik_pip_target_sasaran', all);
    showToast('Semua target sasaran (Kelas 10, 11, 12) dipilih.');
    fetch('/api/pip/kuota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetSasaran: all })
    }).catch(() => {});
  };

  // Handler simpan kuota dan target sasaran dari modal
  const handleSaveKuotaAndSasaran = async () => {
    const num = parseInt(tempKuota);
    if (isNaN(num) || num < 0) {
      alert('Jumlah kuota harus berupa angka minimal 0.');
      return;
    }
    if (tempTargetSasaran.length === 0) {
      alert('Pilih minimal 1 target sasaran kelas (10, 11, atau 12).');
      return;
    }

    setKuota(num);
    setTargetSasaran(tempTargetSasaran);
    safeSetItem('dapodik_pip_kuota', num);
    safeSetItem('dapodik_pip_target_sasaran', tempTargetSasaran);
    setIsEditingKuota(false);
    showToast(`Pengaturan disimpan: Kuota ${num} siswa, Target: ${tempTargetSasaran.map(t => `Kelas ${t}`).join(', ')}`);

    try {
      await fetch('/api/pip/kuota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kuota: num, targetSasaran: tempTargetSasaran })
      });
    } catch (err) {
      console.warn('Gagal menyimpan pengaturan ke server:', err);
    }
  };

  // Map NISN ke rombel dari sheet "data" (data siswa)
  const nisnToRombelMap = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((s) => {
      const cleanNisn = String(s.nisn || '').trim();
      const rombel = String(s.kelas || (s as any).rombel || '').trim();
      if (cleanNisn && rombel) {
        map.set(cleanNisn, rombel);
      }
      // Fallback juga map berdasarkan nama jika nisn kosong
      const cleanNama = String(s.nama || '').trim().toLowerCase();
      if (cleanNama && rombel && !map.has(`name_${cleanNama}`)) {
        map.set(`name_${cleanNama}`, rombel);
      }
    });
    return map;
  }, [students]);

  // Fungsi helper mencari rombel berdasarkan NISN (atau Nama)
  const getRombel = (item: PIPData): string => {
    const cleanNisn = String(item.nisn || '').trim();
    if (cleanNisn && nisnToRombelMap.has(cleanNisn)) {
      return nisnToRombelMap.get(cleanNisn) || '-';
    }
    const cleanNama = String(item.nama || '').trim().toLowerCase();
    if (cleanNama && nisnToRombelMap.has(`name_${cleanNama}`)) {
      return nisnToRombelMap.get(`name_${cleanNama}`) || '-';
    }
    return item.rombel || '-';
  };

  // Muat data dari Google Sheets (sheet "pip")
  const loadPIPData = async (force: boolean = false) => {
    setIsLoading(true);
    try {
      const data = await fetchPIPDirectly(appConfig);
      if (data && data.length > 0) {
        setPipList(data);
        safeSetItem(LOCAL_STORAGE_PIP_KEY, data);
      } else if (pipList.length === 0 && students.length > 0) {
        const initialFromStudents: PIPData[] = students.map((s, idx) => ({
          rowIndex: idx + 2,
          no: idx + 1,
          nisn: String(s.nisn || '').trim(),
          nama: String(s.nama || '').trim(),
          rombel: String(s.kelas || '').trim(),
          alasan_layak: '',
          alasanLayak: ''
        }));
        setPipList(initialFromStudents);
      }
    } catch (err) {
      console.warn('Gagal memuat data PIP:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPIPData();
  }, [appConfig.spreadsheetId, appConfig.webAppUrl]);

  // Tampilkan notifikasi toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Buka modal saat tombol di kolom alasan layak diklik
  const handleOpenReasonModal = (item: PIPData) => {
    // Cek apakah usulan PIP aktif
    if (!isPipAktif) {
      showToast('⚠️ Usulan PIP saat ini sedang DINONAKTIFKAN. Silakan hubungi admin untuk mengaktifkan kembali.');
      return;
    }

    const currentAlasan = (item.alasan_layak || item.alasanLayak || '').trim();
    const isAlreadyProposed = Boolean(currentAlasan);
    const studentTingkat = getTingkatKelas(getRombel(item));
    const isOutsideTarget = studentTingkat !== 'lainnya' && !targetSasaran.includes(studentTingkat);

    if (!isAlreadyProposed) {
      if (isOutsideTarget) {
        showToast(`Perhatian: Siswa berada di ${getRombel(item)} (Kelas ${studentTingkat}), di luar target sasaran aktif.`);
      }
    }

    setSelectedStudent(item);
    
    // Parse alasan yang sudah ada menjadi array (dipisah oleh koma)
    if (currentAlasan) {
      const reasonsArray = currentAlasan.split(/,\s*/).filter(Boolean);
      setSelectedReasons(reasonsArray);
    } else {
      setSelectedReasons([]);
    }
  };

  // Simpan alasan yang dipilih user (Multi-select)
  const handleSaveReason = async () => {
    if (!selectedStudent) return;
    
    if (selectedReasons.length === 0) {
      alert('Mohon pilih minimal 1 alasan layak.');
      return;
    }

    // Gabungkan array menjadi string dipisah koma
    const finalReason = selectedReasons.join(', ');

    const wasAlreadyProposed = Boolean((selectedStudent.alasan_layak || selectedStudent.alasanLayak || '').trim());
    const studentTingkat = getTingkatKelas(getRombel(selectedStudent));
    const isOutsideTarget = studentTingkat !== 'lainnya' && !targetSasaran.includes(studentTingkat);

    if (!wasAlreadyProposed && isOutsideTarget) {
      alert(`Siswa ini berada di ${getRombel(selectedStudent)} (Kelas ${studentTingkat}), di luar target sasaran usulan PIP saat ini (${targetSasaran.map(t => 'Kelas ' + t).join(', ')}). Silakan tambahkan Kelas ${studentTingkat} ke target sasaran terlebih dahulu.`);
      return;
    }

    if (isWaliKelasOnly && assignedKelas && cleanClass(getRombel(selectedStudent)) !== assignedKelas) {
      alert(`Anda hanya dapat mengusulkan siswa dari rombel binaan Anda (${userWaliKelas?.kelas || assignedKelas}).`);
      return;
    }

    setIsSaving(true);
    const targetNisn = selectedStudent.nisn;
    const targetNama = selectedStudent.nama;

    // 1. Update state tabel lokal secara instan
    const updatedList = pipList.map((item) => {
      const isMatch = (targetNisn && item.nisn === targetNisn) ||
                      (targetNama && item.nama.trim().toLowerCase() === targetNama.trim().toLowerCase());
      if (isMatch) {
        return {
          ...item,
          alasan_layak: finalReason,
          alasanLayak: finalReason
        };
      }
      return item;
    });

    setPipList(updatedList);
    safeSetItem(LOCAL_STORAGE_PIP_KEY, updatedList);

    // 2. Kirim update ke backend server & Google Sheets (sheet: "pip")
    try {
      await savePIPDirectly(appConfig.webAppUrl, {
        nisn: targetNisn,
        nama: targetNama,
        alasan_layak: finalReason,
        rowIndex: selectedStudent.rowIndex
      });
      showToast(`Alasan layak untuk "${targetNama}" berhasil disimpan.`);
    } catch (err: any) {
      console.warn('Gagal menyimpan ke Google Sheets:', err);
      showToast(`Alasan disimpan di cache lokal. Sinkronisasi akan diperbarui otomatis.`);
    } finally {
      setIsSaving(false);
      setSelectedStudent(null);
    }
  };

  // Hapus/Kosongkan alasan
  const handleClearReason = async () => {
    if (!selectedStudent) return;
    setIsSaving(true);
    const targetNisn = selectedStudent.nisn;
    const targetNama = selectedStudent.nama;

    const updatedList = pipList.map((item) => {
      const isMatch = (targetNisn && item.nisn === targetNisn) ||
                      (targetNama && item.nama.trim().toLowerCase() === targetNama.trim().toLowerCase());
      if (isMatch) {
        return {
          ...item,
          alasan_layak: '',
          alasanLayak: ''
        };
      }
      return item;
    });

    setPipList(updatedList);
    safeSetItem(LOCAL_STORAGE_PIP_KEY, updatedList);

    try {
      await savePIPDirectly(appConfig.webAppUrl, {
        nisn: targetNisn,
        nama: targetNama,
        alasan_layak: '',
        rowIndex: selectedStudent.rowIndex
      });
      showToast(`Alasan layak untuk "${targetNama}" telah dikosongkan.`);
    } catch {
      showToast(`Alasan dikosongkan di cache.`);
    } finally {
      setIsSaving(false);
      setSelectedStudent(null);
    }
  };

  // Hitung statistik siswa per tingkat sasaran
  const sasaranStats = useMemo(() => {
    let count10 = 0;
    let count11 = 0;
    let count12 = 0;
    let filled10 = 0;
    let filled11 = 0;
    let filled12 = 0;

    pipList.forEach((item) => {
      const rombel = getRombel(item);
      const tingkat = getTingkatKelas(rombel);
      const isFilled = Boolean((item.alasan_layak || item.alasanLayak || '').trim());

      if (tingkat === '10') {
        count10++;
        if (isFilled) filled10++;
      } else if (tingkat === '11') {
        count11++;
        if (isFilled) filled11++;
      } else if (tingkat === '12') {
        count12++;
        if (isFilled) filled12++;
      }
    });

    const totalSasaranSiswa = 
      (targetSasaran.includes('10') ? count10 : 0) +
      (targetSasaran.includes('11') ? count11 : 0) +
      (targetSasaran.includes('12') ? count12 : 0);

    const filledSasaranSiswa = 
      (targetSasaran.includes('10') ? filled10 : 0) +
      (targetSasaran.includes('11') ? filled11 : 0) +
      (targetSasaran.includes('12') ? filled12 : 0);

    return {
      count10, count11, count12,
      filled10, filled11, filled12,
      totalSasaranSiswa,
      filledSasaranSiswa
    };
  }, [pipList, targetSasaran, nisnToRombelMap]);

  // Statistik usulan khusus rombel wali kelas (jika akun wali kelas)
  const waliKelasStats = useMemo(() => {
    if (!isWaliKelasOnly || !assignedKelas) return null;
    let totalInRombel = 0;
    let filledInRombel = 0;
    pipList.forEach((item) => {
      if (cleanClass(getRombel(item)) === assignedKelas) {
        totalInRombel++;
        if (Boolean((item.alasan_layak || item.alasanLayak || '').trim())) {
          filledInRombel++;
        }
      }
    });
    return {
      totalInRombel,
      filledInRombel,
      emptyInRombel: Math.max(0, totalInRombel - filledInRombel)
    };
  }, [pipList, isWaliKelasOnly, assignedKelas, nisnToRombelMap]);

  // Filter & Pencarian Data
  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pipList.filter((item) => {
      const rombel = getRombel(item);
      const rombelClean = cleanClass(rombel);

      if (isWaliKelasOnly && assignedKelas) {
        if (rombelClean !== assignedKelas) return false;
      }

      const tingkat = getTingkatKelas(rombel);
      if (filterOnlyTarget && tingkat !== 'lainnya' && !targetSasaran.includes(tingkat)) {
        return false;
      }

      const nama = String(item.nama || '').toLowerCase();
      const nisn = String(item.nisn || '').toLowerCase();
      const rombelLower = rombel.toLowerCase();
      const alasan = String(item.alasan_layak || item.alasanLayak || '').toLowerCase();

      const matchesSearch = !q || nama.includes(q) || nisn.includes(q) || rombelLower.includes(q) || alasan.includes(q);
      if (!matchesSearch) return false;

      const hasReason = Boolean(item.alasan_layak || item.alasanLayak);
      if (filterStatus === 'filled') return hasReason;
      if (filterStatus === 'empty') return !hasReason;
      return true;
    });
  }, [pipList, search, filterStatus, nisnToRombelMap, targetSasaran, filterOnlyTarget, isWaliKelasOnly, assignedKelas]);

  // Handler klik header kolom untuk toggle sortir
  const handleToggleSort = (field: 'rombel' | 'nama' | 'nisn') => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField('default');
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Data terfilter yang disortir untuk tabel UI
  const processedData = useMemo(() => {
    const list = [...filteredData];
    if (sortField === 'rombel') {
      list.sort((a, b) => {
        const rA = getRombel(a) || '';
        const rB = getRombel(b) || '';
        if (rA === '-' && rB !== '-') return 1;
        if (rA !== '-' && rB === '-') return -1;
        const cmp = rA.localeCompare(rB, 'id', { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return sortDirection === 'asc' ? cmp : -cmp;
        return (a.nama || '').localeCompare(b.nama || '', 'id');
      });
    } else if (sortField === 'nama') {
      list.sort((a, b) => {
        const cmp = (a.nama || '').localeCompare(b.nama || '', 'id');
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    } else if (sortField === 'nisn') {
      list.sort((a, b) => {
        const cmp = (a.nisn || '').localeCompare(b.nisn || '', 'id');
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [filteredData, sortField, sortDirection]);

  // Pagination
  const totalItems = processedData.length;
  const effectivePerPage = itemsPerPage === -1 ? totalItems : itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / (effectivePerPage || 1)));
  const paginatedData = useMemo(() => {
    if (itemsPerPage === -1) return processedData;
    const start = (currentPage - 1) * itemsPerPage;
    return processedData.slice(start, start + itemsPerPage);
  }, [processedData, currentPage, itemsPerPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Download Excel
  const handleDownloadExcel = () => {
    if (filteredData.length === 0) {
      alert('Tidak ada data untuk diekspor ke Excel.');
      return;
    }

    const sortedData = [...filteredData].sort((a, b) => {
      const rombelA = getRombel(a) || '';
      const rombelB = getRombel(b) || '';
      if (rombelA === '-' && rombelB !== '-') return 1;
      if (rombelA !== '-' && rombelB === '-') return -1;
      const rombelComparison = rombelA.localeCompare(rombelB, 'id', { numeric: true, sensitivity: 'base' });
      if (rombelComparison !== 0) return rombelComparison;
      const namaA = (a.nama || '').trim();
      const namaB = (b.nama || '').trim();
      return namaA.localeCompare(namaB, 'id', { sensitivity: 'base' });
    });

    const exportRows = sortedData.map((item, idx) => ({
      'No': idx + 1,
      'NISN': item.nisn || '',
      'Nama_Murid': item.nama || '',
      'Rombel': getRombel(item),
      'alasan_layak': item.alasan_layak || item.alasanLayak || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 6 }, { wch: 16 }, { wch: 35 }, { wch: 18 }, { wch: 45 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Usulan PIP');
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Usulan_PIP_SMKN1_Palopo_${dateStr}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${
          toastMessage.includes('DINONAKTIFKAN') 
            ? 'bg-rose-600 text-white' 
            : 'bg-slate-900 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="bg-white p-4 lg:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-indigo-600" /> Usulan PIP
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Klik pada tombol di kolom "Alasan Layak" untuk menentukan kelayakan usulan PIP (Bisa memilih lebih dari 1).
          </p>
          {isWaliKelasOnly && userWaliKelas && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold">
                <Users className="w-3.5 h-3.5" />
                <span>Wali Kelas: {userWaliKelas.nama || currentUser?.nama} &bull; Rombel {userWaliKelas.kelas}</span>
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
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

          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e: any) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="py-2 pl-3 pr-8 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none"
            >
              <option value="all">
                {isWaliKelasOnly && userWaliKelas
                  ? `Siswa Rombel ${userWaliKelas.kelas} (${waliKelasStats?.totalInRombel ?? filteredData.length})`
                  : `Semua Siswa (${pipList.length})`}
              </option>
              <option value="filled">
                Sudah Diusulkan ({isWaliKelasOnly ? (waliKelasStats?.filledInRombel ?? totalTerusul) : totalTerusul})
              </option>
              <option value="empty">
                Belum Diusulkan ({isWaliKelasOnly ? (waliKelasStats?.emptyInRombel ?? 0) : Math.max(0, pipList.length - totalTerusul)})
              </option>
            </select>
            <Filter className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={() => loadPIPData(true)}
            disabled={isLoading}
            title="Segarkan data dari spreadsheet"
            className="p-2 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {isAdmin && (
            <button
              onClick={handleDownloadExcel}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Usulan PIP Bar */}
      <div className={`border rounded-2xl p-4 lg:p-5 transition-all ${
        isPipAktif 
          ? 'bg-white border-slate-200 shadow-xs' 
          : 'bg-rose-50/70 border-rose-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              isPipAktif 
                ? 'bg-emerald-50 text-emerald-700' 
                : 'bg-rose-100 text-rose-700'
            }`}>
              {isPipAktif ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status Usulan PIP
                </span>
                {isPipAktif ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    AKTIF
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white animate-pulse">
                    DINONAKTIFKAN
                  </span>
                )}
              </div>
              {!isPipAktif && (
                <p className="text-xs text-rose-700 mt-1">
                  Usulan PIP sedang ditutup.
                </p>
              )}
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={handleTogglePipAktif}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer shrink-0 ${
                isPipAktif
                  ? 'border-rose-300 hover:border-rose-400 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800'
                  : 'border-emerald-300 hover:border-emerald-400 bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800'
              }`}
              title={isPipAktif ? 'Nonaktifkan usulan PIP' : 'Aktifkan usulan PIP'}
            >
              {isPipAktif ? (
                <>
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>Nonaktifkan</span>
                </>
              ) : (
                <>
                  <Power className="w-3.5 h-3.5" />
                  <span>Aktifkan</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Clean Grid Table */}
      <div className={`bg-white border rounded-xl shadow-2xs overflow-hidden w-full ${
        !isPipAktif ? 'border-rose-200' : 'border-slate-300'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold text-xs border-b border-slate-300 select-none">
                <th className="py-2.5 px-3 text-center border-r border-slate-300 w-12">No</th>
                <th 
                  onClick={() => handleToggleSort('nisn')}
                  className="py-2.5 px-4 border-r border-slate-300 w-36 cursor-pointer hover:bg-slate-200/70 transition-colors"
                  title="Klik untuk menyortir NISN"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>NISN</span>
                    {sortField === 'nisn' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => handleToggleSort('nama')}
                  className="py-2.5 px-4 border-r border-slate-300 min-w-[220px] cursor-pointer hover:bg-slate-200/70 transition-colors"
                  title="Klik untuk menyortir Nama Murid"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Nama Murid</span>
                    {sortField === 'nama' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => handleToggleSort('rombel')}
                  className="py-2.5 px-3 border-r border-slate-300 w-32 cursor-pointer hover:bg-slate-200/70 transition-colors"
                  title="Klik untuk menyortir Rombel (A-Z)"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Rombel</span>
                    {sortField === 'rombel' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>
                <th className="py-2.5 px-4 min-w-[260px]">Alasan Layak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {isLoading && pipList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                      <span>Memuat data usulan PIP dari Google Sheets...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-14 text-center text-slate-500 italic">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <AlertCircle className="w-6 h-6 text-slate-400" />
                      <span>Tidak ada data siswa ditemukan</span>
                      {search && <span className="text-[11px] text-slate-400">Cobalah kata kunci pencarian yang berbeda</span>}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, idx) => {
                  const itemIndex = (currentPage - 1) * (itemsPerPage === -1 ? totalItems : itemsPerPage) + idx + 1;
                  const rombel = getRombel(item);
                  const reason = (item.alasan_layak || item.alasanLayak || '').trim();

                  return (
                    <tr 
                      key={item.nisn ? `pip-${item.nisn}-${idx}` : `pip-row-${idx}`}
                      className={`hover:bg-indigo-50/40 transition-colors border-b border-slate-200 group ${
                        !isPipAktif ? 'opacity-75' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center border-r border-slate-200 text-slate-600 font-medium">{itemIndex}</td>
                      <td className="py-2.5 px-4 border-r border-slate-200 font-mono text-slate-700">{item.nisn || '-'}</td>
                      <td className="py-2.5 px-4 border-r border-slate-200 font-semibold text-slate-900">
                        <span className="truncate">{item.nama || '-'}</span>
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200 text-slate-700">{rombel !== '-' ? rombel : '-'}</td>
                      
                      {/* KOLOM ALASAN LAYAK DENGAN TOMBOL KLIK */}
                      <td className="py-2.5 px-4 text-slate-800">
                        <button
                          onClick={() => handleOpenReasonModal(item)}
                          disabled={!isPipAktif}
                          className={`w-full text-left flex items-center justify-between gap-2 p-1.5 -mx-1.5 rounded-lg transition-colors group/btn border border-transparent ${
                            isPipAktif
                              ? 'hover:bg-indigo-50/60 hover:border-indigo-200 cursor-pointer'
                              : 'cursor-not-allowed opacity-60'
                          }`}
                          title={!isPipAktif ? 'Usulan PIP sedang dinonaktifkan' : 'Klik untuk memilih atau mengubah alasan layak PIP'}
                        >
                          <span className={`flex-1 truncate text-xs ${reason ? 'text-slate-800 font-medium' : 'text-slate-400 italic'}`}>
                            {reason || (isPipAktif ? 'Klik untuk pilih alasan' : 'Usulan ditutup')}
                          </span>
                          {isPipAktif && (
                            <span className="text-[10px] text-indigo-600 font-semibold opacity-0 group-hover/btn:opacity-100 transition-opacity shrink-0">
                              {reason ? 'Ubah' : 'Pilih'} &rarr;
                            </span>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Clean Footer Pagination */}
        <div className="py-3 px-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <span>
              Menampilkan <span className="font-semibold text-slate-900">{filteredData.length > 0 ? (currentPage - 1) * (itemsPerPage === -1 ? totalItems : itemsPerPage) + 1 : 0}</span> - <span className="font-semibold text-slate-900">{itemsPerPage === -1 ? totalItems : Math.min(currentPage * itemsPerPage, totalItems)}</span> dari <span className="font-semibold text-slate-900">{totalItems}</span> siswa
            </span>
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-400">Tampilkan:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-xs text-slate-700 cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>Semua ({totalItems})</option>
              </select>
            </div>
          </div>

          {itemsPerPage !== -1 && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 border border-slate-300 bg-white hover:bg-slate-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-2 font-medium text-slate-700">Halaman {currentPage} dari {totalPages}</div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 border border-slate-300 bg-white hover:bg-slate-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Halaman Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Pemilihan Alasan Layak PIP (Multi-Select) */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-start justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                  Pilih Alasan Layak PIP
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">{selectedStudent.nama}</span>
                  <span className="text-slate-300">&bull;</span>
                  <span className="font-mono text-slate-600">NISN: {selectedStudent.nisn || '-'}</span>
                  <span className="text-slate-300">&bull;</span>
                  <span className="px-1.5 py-0.2 bg-slate-200 rounded text-slate-700 font-medium">
                    Rombel: {getRombel(selectedStudent)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudent(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-2 flex-1 text-xs">
              {(() => {
                const studentTingkat = getTingkatKelas(getRombel(selectedStudent));
                const isOutsideTarget = studentTingkat !== 'lainnya' && !targetSasaran.includes(studentTingkat);
                const isAlreadyProposed = Boolean((selectedStudent.alasan_layak || selectedStudent.alasanLayak || '').trim());

                if (isOutsideTarget && !isAlreadyProposed) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 mb-3">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-bold">Siswa Di Luar Target Sasaran Aktif</span>
                        <p className="mt-0.5 text-amber-800">
                          Siswa berada di rombel <strong>{getRombel(selectedStudent)}</strong> (Kelas {studentTingkat}). Target sasaran aktif saat ini: <strong>{targetSasaran.map(t => `Kelas ${t}`).join(', ')}</strong>.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleToggleSasaran(studentTingkat)}
                          className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          + Tambahkan Kelas {studentTingkat} ke Target Sasaran
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <p className="text-slate-600 font-medium mb-3">
                    Silakan pilih <strong>minimal 1</strong> alasan pengusulan layak PIP yang sesuai (bisa lebih dari satu):
                  </p>
                );
              })()}

              <div className="space-y-1.5">
                {OPSI_ALASAN_LAYAK.map((opsi, idx) => {
                  const isChecked = selectedReasons.includes(opsi);
                  return (
                    <label
                      key={`opsi-${idx}`}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        isChecked 
                          ? 'bg-indigo-50/70 border-indigo-400 shadow-xs' 
                          : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedReasons([...selectedReasons, opsi]);
                          } else {
                            setSelectedReasons(selectedReasons.filter(r => r !== opsi));
                          }
                        }}
                        className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <span className={`block font-medium ${isChecked ? 'text-indigo-950 font-bold' : 'text-slate-800'}`}>
                          {opsi}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              {(selectedStudent.alasan_layak || selectedStudent.alasanLayak) ? (
                <button
                  type="button"
                  onClick={handleClearReason}
                  disabled={isSaving}
                  className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  Kosongkan Alasan
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  disabled={isSaving}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-white bg-slate-100 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                {(() => {
                  const studentTingkat = getTingkatKelas(getRombel(selectedStudent));
                  const isOutsideTarget = studentTingkat !== 'lainnya' && !targetSasaran.includes(studentTingkat);
                  const isAlreadyProposed = Boolean((selectedStudent.alasan_layak || selectedStudent.alasanLayak || '').trim());
                  const cannotSaveDueToTarget = !isAlreadyProposed && isOutsideTarget;
                  const isBtnDisabled = isSaving || selectedReasons.length === 0 || cannotSaveDueToTarget;

                  return (
                    <button
                      type="button"
                      onClick={handleSaveReason}
                      disabled={isBtnDisabled}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer ${
                        isBtnDisabled
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      }`}
                    >
                      {isSaving ? (
                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Menyimpan...</span></>
                      ) : cannotSaveDueToTarget ? (
                        <><Lock className="w-3.5 h-3.5" /><span>Di Luar Sasaran</span></>
                      ) : (
                        <><Check className="w-3.5 h-3.5" /><span>Simpan ({selectedReasons.length} dipilih)</span></>
                      )}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pengaturan Kuota & Target Sasaran PIP */}
      {isEditingKuota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-4 h-4 text-indigo-600" /> Atur Kuota & Target Sasaran PIP
              </h3>
              <button
                onClick={() => setIsEditingKuota(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">1. Jumlah Kuota Usulan PIP (Siswa)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={tempKuota}
                  onChange={(e) => setTempKuota(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800 font-semibold"
                  placeholder="Contoh: 50"
                  autoFocus
                />
                <div className="mt-2">
                  <span className="block text-[11px] text-slate-500 mb-1.5 font-medium">Pilihan Cepat Kuota:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[25, 50, 75, 100, 150, 200].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTempKuota(String(preset))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                          tempKuota === String(preset)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-semibold text-slate-800">2. Target Sasaran Tingkat Kelas</label>
                  <span className="text-[11px] text-indigo-600 font-medium">Bisa memilih &gt; 1</span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2.5">Pilih tingkat kelas yang berhak/ditargetkan untuk diusulkan menerima bantuan PIP:</p>

                <div className="space-y-2">
                  {OPSI_TARGET_SASARAN.map((opsi) => {
                    const isChecked = tempTargetSasaran.includes(opsi.id);
                    const countSiswa = opsi.id === '10' ? sasaranStats.count10 : opsi.id === '11' ? sasaranStats.count11 : sasaranStats.count12;
                    const filledSiswa = opsi.id === '10' ? sasaranStats.filled10 : opsi.id === '11' ? sasaranStats.filled11 : sasaranStats.filled12;

                    return (
                      <label
                        key={`modal-sasaran-${opsi.id}`}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                          isChecked ? 'bg-indigo-50/80 border-indigo-400 shadow-2xs' : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                if (tempTargetSasaran.length <= 1) {
                                  alert('Minimal harus memilih 1 target sasaran kelas.');
                                  return;
                                }
                                setTempTargetSasaran(tempTargetSasaran.filter(t => t !== opsi.id));
                              } else {
                                setTempTargetSasaran([...tempTargetSasaran, opsi.id].sort());
                              }
                            }}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                          />
                          <div>
                            <span className={`font-semibold ${isChecked ? 'text-indigo-950 font-bold' : 'text-slate-800'}`}>{opsi.label}</span>
                            <span className="text-[11px] text-slate-500 ml-1.5 font-normal">(Tingkat {opsi.badge})</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {filledSiswa} / {countSiswa} siswa
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-2 pt-1 text-[11px]">
                  <span className="text-slate-500">Terpilih: <strong>{tempTargetSasaran.length} dari 3 tingkat</strong></span>
                  <button
                    type="button"
                    onClick={() => setTempTargetSasaran(['10', '11', '12'])}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer hover:underline"
                  >
                    Pilih Semua Kelas (10, 11, 12)
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div>Total Usulan Saat Ini: <strong className="text-indigo-600">{totalTerusul}</strong> siswa</div>
                <div>Kuota yang Ditetapkan: <strong className="text-slate-800">{tempKuota}</strong> siswa</div>
                <div>Target Sasaran: <strong className="text-slate-800">{tempTargetSasaran.map(t => `Kelas ${t}`).join(', ') || '-'}</strong></div>
              </div>
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditingKuota(false)}
                className="px-3.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-white bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveKuotaAndSasaran}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
              >
                Simpan Pengaturan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};