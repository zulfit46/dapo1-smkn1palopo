import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Banknote, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  Printer, 
  Plus, 
  Edit, 
  Trash2, 
  RefreshCw, 
  SlidersHorizontal, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Check, 
  AlertCircle, 
  User, 
  Building2, 
  CreditCard,
  DollarSign,
  Receipt,
  Download,
  RotateCcw,
  Calendar,
  Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GTKData, GajiData, AppConfig, AppTheme } from '../types';
import { INITIAL_GTK_LIST } from '../data/initialGTK';
import { INITIAL_GAJI_LIST } from '../data/initialGaji';
import { fetchGajiFromSheet, saveGajiDirectly, syncAllGajiDirectly, deleteGajiDirectly } from '../services/sheetsSync';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { formatRupiah } from '../utils/dateUtils';
import { isUserRole, isOwnerOfRecord } from '../utils/authUtils';
import { GTKGajiImportModal } from './GTKGajiImportModal';

const LOCAL_STORAGE_GAJI_KEY = 'dapodik_cached_gaji';

interface GTKGajiViewProps {
  gtkList?: GTKData[];
  appConfig?: AppConfig;
  currentUser?: GTKData | null;
  theme?: AppTheme;
}

export const GTKGajiView: React.FC<GTKGajiViewProps> = ({
  gtkList = INITIAL_GTK_LIST,
  appConfig,
  currentUser,
  theme
}) => {
  const isUser = isUserRole(currentUser);
  const isAdmin = !isUser;
  const isGlass = theme === 'aurora-glass';

  // Helper pemeriksa apakah suatu objek adalah data siswa (bukan GTK / Gaji)
  const isStudentLeak = useCallback((item: any): boolean => {
    if (!item) return false;
    return Boolean(
      item.nisn || 
      item.nipd || 
      item.rombel || 
      item.kelas || 
      item.sekolahAsal || 
      item.namaAyah || 
      item.nama_ayah ||
      item.tempatLahir ||
      !item.nip ||
      String(item.nip).trim().length < 8
    );
  }, []);

  // State data gaji (dengan proteksi ketat anti-data siswa)
  const [gajiList, setGajiList] = useState<GajiData[]>(() => {
    const cached = safeGetItem<any[]>(LOCAL_STORAGE_GAJI_KEY, []);
    if (Array.isArray(cached) && cached.length > 0) {
      const hasStudent = cached.some(item => !item || !item.nip || String(item.nip).trim().length < 8 || item.nisn || item.nipd || item.rombel);
      if (!hasStudent) {
        return cached as GajiData[];
      } else {
        // Bersihkan cache yang tercemar data siswa dari browser
        try { localStorage.removeItem(LOCAL_STORAGE_GAJI_KEY); } catch (e) {}
      }
    }
    return INITIAL_GAJI_LIST;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Handler Terapkan Smart Impor Gaji GTK
  const handleApplyImportGaji = async (
    finalList: GajiData[],
    mode: 'merge' | 'replace',
    stats: { matchingCount: number; newCount: number; retainedCount: number; finalTotal: number }
  ) => {
    setGajiList(finalList);
    safeSetItem(LOCAL_STORAGE_GAJI_KEY, finalList);
    setNotification({
      type: 'success',
      message: `Smart Impor berhasil (${stats.matchingCount} diperbarui, ${stats.newCount} baru, total ${stats.finalTotal} data gaji)!`
    });
    setTimeout(() => setNotification(null), 6000);

    if (appConfig?.webAppUrl) {
      syncAllGajiDirectly(appConfig.webAppUrl, finalList, mode).catch((err) => {
        console.warn('Latar belakang sync Gaji Sheets gagal:', err);
      });
    }
  };

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('Semua');
  const [selectedBulan, setSelectedBulan] = useState<string>('Semua');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Column Visibility
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    nip: true,
    nama: true,
    bulan: true,
    status: true,
    gajiPokok: true,
    jumKotor: true,
    jumBersih: true
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GajiData | null>(null);
  const [detailItem, setDetailItem] = useState<GajiData | null>(null);
  const [deleteItem, setDeleteItem] = useState<GajiData | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    nip: '',
    nama: '',
    bulan: 'Oktober 2026',
    gajiPokok: 0,
    jumKotor: 0,
    jumBersih: 0
  });

  // Normalisasi NIP untuk pencocokan string angka murni
  const cleanNip = useCallback((nipVal: any): string => {
    return String(nipVal || '').replace(/[^0-9]/g, '').trim();
  }, []);

  // Helper pemadanan data GTK berdasarkan NIP
  const getGtkInfoForGaji = useCallback((nip: string, fallbackNama?: string) => {
    const pureNip = cleanNip(nip);
    const matched = gtkList.find((g) => {
      const gNip = cleanNip(g.nip);
      return gNip && pureNip && gNip === pureNip;
    });

    const deriveStatus = (nipStr: string) => {
      const clean = String(nipStr || '').replace(/[^0-9]/g, '');
      if (clean.length === 18) {
        const kode = clean.substring(12, 14);
        if (kode === '21') return 'PPPK';
        return 'PNS';
      }
      return 'PPPK';
    };

    return {
      nama: matched?.nama || fallbackNama || '-',
      status: matched?.statusKepegawaian || (matched as any)?.status || deriveStatus(nip),
      jenisPtk: matched?.jenisPtk || '-',
      pangkatGolongan: matched?.pangkatGolongan || '-'
    };
  }, [gtkList, cleanNip]);

  // Muat data dari Google Sheets sheet "gaji"
  const loadDataFromSheet = useCallback(async (force = false) => {
    setIsLoading(true);
    try {
      const data = await fetchGajiFromSheet(appConfig?.webAppUrl, appConfig?.spreadsheetId);
      if (Array.isArray(data) && data.length > 0) {
        // VALIDASI KEAMANAN: Pastikan data yang dikembalikan BUKAN data siswa
        const containsStudents = data.some(isStudentLeak);
        if (!containsStudents) {
          setGajiList(data);
          safeSetItem(LOCAL_STORAGE_GAJI_KEY, data);
          if (force) {
            showNotification('success', `Berhasil memuat ${data.length} data gaji dari sheet "gaji"`);
          }
        } else {
          // Bersihkan cache yang tercemar
          try { localStorage.removeItem(LOCAL_STORAGE_GAJI_KEY); } catch (e) {}
          setGajiList(INITIAL_GAJI_LIST);
          if (force) {
            showNotification('error', 'Google Apps Script Web App masih menggunakan versi lama (mengembalikan data siswa). Mohon lakukan Deploy Versi Baru di Apps Script.');
          }
        }
      } else if (force) {
        showNotification('success', 'Data gaji telah disinkronkan');
      }
    } catch (err: any) {
      if (force) {
        showNotification('error', err?.message || 'Gagal memuat data dari sheet "gaji"');
      }
    } finally {
      setIsLoading(false);
    }
  }, [appConfig?.webAppUrl, appConfig?.spreadsheetId, isStudentLeak]);

  useEffect(() => {
    loadDataFromSheet(false);
  }, [loadDataFromSheet]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Batasan akses jika role user (hanya melihat gajinya sendiri)
  const accessibleGajiList = useMemo(() => {
    // Saring dan buang segala record siswa yang tidak sengaja terbawa
    const cleanGajiOnly = gajiList.filter((g) => !isStudentLeak(g));
    const effectiveList = cleanGajiOnly.length > 0 ? cleanGajiOnly : INITIAL_GAJI_LIST;

    if (isUser && currentUser) {
      const userNip = cleanNip(currentUser.nip);
      const filtered = effectiveList.filter((g) => {
        const itemNip = cleanNip(g.nip);
        return (userNip && itemNip && userNip === itemNip) || isOwnerOfRecord(g.nip, g.nama, currentUser);
      });
      // Jika belum ada di list sheet gaji, tampilkan placeholder sesuai user
      if (filtered.length === 0) {
        return [{
          id: `GAJI-${currentUser.nip || 'user'}`,
          no: 1,
          nip: currentUser.nip || '-',
          nama: currentUser.nama || '-',
          bulan: 'Oktober 2026',
          status: currentUser.statusKepegawaian || 'PNS',
          gaji_pokok: 0,
          gajiPokok: 0,
          jum_kotor: 0,
          jumKotor: 0,
          jum_bersih: 0,
          jumBersih: 0
        }];
      }
      return filtered;
    }
    return effectiveList;
  }, [gajiList, isUser, currentUser, cleanNip, isStudentLeak]);

  // Data dengan pemadanan Nama & Status dari Sheet "gtk"
  const enrichedGajiList = useMemo(() => {
    return accessibleGajiList.map((item, idx) => {
      const gtkInfo = getGtkInfoForGaji(item.nip, item.nama);
      const rawBulan = String(item.bulan || (item as any).Bulan || '').trim();
      const gp = Number(item.gajiPokok !== undefined ? item.gajiPokok : (item.gaji_pokok || 0));
      const jk = Number(item.jumKotor !== undefined ? item.jumKotor : (item.jum_kotor || 0));
      const jb = Number(item.jumBersih !== undefined ? item.jumBersih : (item.jum_bersih || 0));

      return {
        ...item,
        displayNo: item.no || idx + 1,
        displayNama: gtkInfo.nama,
        displayBulan: rawBulan || '-',
        displayStatus: gtkInfo.status,
        displayJenisPtk: gtkInfo.jenisPtk,
        displayGolongan: gtkInfo.pangkatGolongan,
        numGajiPokok: gp,
        numJumKotor: jk,
        numJumBersih: jb
      };
    });
  }, [accessibleGajiList, getGtkInfoForGaji]);

  // Daftar opsi status unik untuk filter dropdown
  const uniqueStatusList = useMemo(() => {
    const set = new Set<string>();
    enrichedGajiList.forEach((item) => {
      if (item.displayStatus) set.add(item.displayStatus.trim());
    });
    return ['Semua', ...Array.from(set).sort()];
  }, [enrichedGajiList]);

  // Daftar opsi bulan unik untuk filter dropdown
  const uniqueBulanList = useMemo(() => {
    const set = new Set<string>();
    enrichedGajiList.forEach((item) => {
      if (item.displayBulan && item.displayBulan !== '-') set.add(item.displayBulan.trim());
    });
    return ['Semua', ...Array.from(set).sort()];
  }, [enrichedGajiList]);

  // Data terfilter berdasarkan search, status & bulan
  const filteredData = useMemo(() => {
    return enrichedGajiList.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = 
        !q ||
        item.nip.toLowerCase().includes(q) ||
        item.displayNama.toLowerCase().includes(q) ||
        item.displayBulan.toLowerCase().includes(q) ||
        item.displayStatus.toLowerCase().includes(q);

      const matchStatus = selectedStatus === 'Semua' || item.displayStatus === selectedStatus;
      const matchBulan = selectedBulan === 'Semua' || item.displayBulan === selectedBulan;

      return matchSearch && matchStatus && matchBulan;
    });
  }, [enrichedGajiList, searchQuery, selectedStatus, selectedBulan]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  // Ringkasan Total
  const totals = useMemo(() => {
    const totalPokok = filteredData.reduce((acc, curr) => acc + curr.numGajiPokok, 0);
    const totalKotor = filteredData.reduce((acc, curr) => acc + curr.numJumKotor, 0);
    const totalBersih = filteredData.reduce((acc, curr) => acc + curr.numJumBersih, 0);
    return {
      pegawai: filteredData.length,
      pokok: totalPokok,
      kotor: totalKotor,
      bersih: totalBersih
    };
  }, [filteredData]);

  // Handle Buka Modal Tambah/Edit
  const handleOpenModal = (item?: GajiData) => {
    if (item) {
      setEditingItem(item);
      const gp = Number(item.gajiPokok !== undefined ? item.gajiPokok : (item.gaji_pokok || 0));
      const jk = Number(item.jumKotor !== undefined ? item.jumKotor : (item.jum_kotor || 0));
      const jb = Number(item.jumBersih !== undefined ? item.jumBersih : (item.jum_bersih || 0));
      setFormData({
        nip: item.nip || '',
        nama: item.nama || '',
        bulan: item.bulan || 'Oktober 2026',
        gajiPokok: gp,
        jumKotor: jk,
        jumBersih: jb
      });
    } else {
      setEditingItem(null);
      setFormData({
        nip: '',
        nama: '',
        bulan: 'Oktober 2026',
        gajiPokok: 0,
        jumKotor: 0,
        jumBersih: 0
      });
    }
    setIsModalOpen(true);
  };

  // Pilih NIP dari dropdown GTK
  const handleSelectNIP = (nip: string) => {
    const matched = gtkList.find((g) => cleanNip(g.nip) === cleanNip(nip));
    setFormData((prev) => ({
      ...prev,
      nip: nip,
      nama: matched ? matched.nama : prev.nama
    }));
  };

  // Simpan data gaji
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nip) {
      showNotification('error', 'NIP wajib diisi');
      return;
    }

    setIsSaving(true);
    try {
      const gtkInfo = getGtkInfoForGaji(formData.nip, formData.nama);
      const newItem: GajiData = {
        id: editingItem ? editingItem.id : `GAJI-${formData.nip || Date.now()}`,
        no: editingItem?.no || gajiList.length + 1,
        nip: formData.nip.trim(),
        nama: gtkInfo.nama || formData.nama.trim(),
        bulan: formData.bulan.trim(),
        status: gtkInfo.status,
        gaji_pokok: Number(formData.gajiPokok) || 0,
        gajiPokok: Number(formData.gajiPokok) || 0,
        jum_kotor: Number(formData.jumKotor) || 0,
        jumKotor: Number(formData.jumKotor) || 0,
        jum_bersih: Number(formData.jumBersih) || 0,
        jumBersih: Number(formData.jumBersih) || 0
      };

      let updatedList: GajiData[] = [];
      if (editingItem) {
        updatedList = gajiList.map((g) => g.id === editingItem.id || cleanNip(g.nip) === cleanNip(editingItem.nip) ? newItem : g);
      } else {
        // Cek duplikasi NIP
        const exists = gajiList.some((g) => cleanNip(g.nip) === cleanNip(newItem.nip));
        if (exists) {
          updatedList = gajiList.map((g) => cleanNip(g.nip) === cleanNip(newItem.nip) ? newItem : g);
        } else {
          updatedList = [...gajiList, newItem];
        }
      }

      setGajiList(updatedList);
      safeSetItem(LOCAL_STORAGE_GAJI_KEY, updatedList);
      setIsModalOpen(false);

      // Simpan langsung ke sheet "gaji"
      if (appConfig?.webAppUrl) {
        await saveGajiDirectly(appConfig.webAppUrl, newItem);
      }

      showNotification('success', editingItem ? 'Data gaji berhasil diperbarui' : 'Data gaji baru berhasil ditambahkan');
    } catch (err: any) {
      showNotification('error', err?.message || 'Gagal menyimpan data gaji');
    } finally {
      setIsSaving(false);
    }
  };

  // Hapus data gaji
  const handleConfirmDelete = async () => {
    if (!deleteItem) return;
    setIsSaving(true);
    try {
      const updatedList = gajiList.filter((g) => g.id !== deleteItem.id && cleanNip(g.nip) !== cleanNip(deleteItem.nip));
      setGajiList(updatedList);
      safeSetItem(LOCAL_STORAGE_GAJI_KEY, updatedList);

      if (appConfig?.webAppUrl) {
        await deleteGajiDirectly(appConfig.webAppUrl, deleteItem.id || deleteItem.nip, deleteItem.rowIndex);
      }

      showNotification('success', 'Data gaji berhasil dihapus');
      setDeleteItem(null);
    } catch (err: any) {
      showNotification('error', err?.message || 'Gagal menghapus data');
    } finally {
      setIsSaving(false);
    }
  };

  // Sinkronisasi Semua Data Gaji ke Sheet
  const handleSyncAll = async () => {
    if (!appConfig?.webAppUrl) {
      showNotification('error', 'URL Web App Google Apps Script belum dikonfigurasi');
      return;
    }
    setIsSyncing(true);
    try {
      const ok = await syncAllGajiDirectly(appConfig.webAppUrl, gajiList);
      if (ok) {
        showNotification('success', `Berhasil menyinkronkan seluruh data gaji (${gajiList.length} data) ke sheet "gaji"`);
      } else {
        showNotification('error', 'Gagal menyinkronkan data ke sheet "gaji"');
      }
    } catch (err: any) {
      showNotification('error', err?.message || 'Terjadi kesalahan saat sinkronisasi');
    } finally {
      setIsSyncing(false);
    }
  };

  // Ekspor Excel (XLSX) dengan header sesuai spesifikasi
  const handleExportExcel = () => {
    const headers = ['No', 'NIP', 'Nama', 'Bulan', 'Status', 'Gaji Pokok', 'Jumlah Kotor', 'Jumlah Bersih'];
    const rows = filteredData.map((item, idx) => [
      idx + 1,
      `'${item.nip}`,
      item.displayNama,
      item.displayBulan,
      item.displayStatus,
      item.numGajiPokok,
      item.numJumKotor,
      item.numJumBersih
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Formatting kolom uang
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gaji_GTK');
    XLSX.writeFile(wb, `Data_Gaji_GTK_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Cetak Dokumen PDF
  const handlePrintPDF = () => {
    const doc = new jsPDF('p', 'pt', 'a4');
    doc.setFontSize(14);
    doc.text('DAFTAR GAJI GURU & TENAGA KEPENDIDIKAN (GTK)', 40, 40);
    doc.setFontSize(10);
    doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')} | Total Pegawai: ${filteredData.length}`, 40, 58);

    const headers = [['No', 'NIP', 'Nama', 'Bulan', 'Status', 'Gaji Pokok', 'Jumlah Kotor', 'Jumlah Bersih']];
    const dataRows = filteredData.map((item, idx) => [
      String(idx + 1),
      String(item.nip),
      item.displayNama,
      item.displayBulan,
      item.displayStatus,
      formatRupiah(item.numGajiPokok),
      formatRupiah(item.numJumKotor),
      formatRupiah(item.numJumBersih)
    ]);

    autoTable(doc, {
      head: headers,
      body: dataRows,
      startY: 70,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' }
    });

    doc.save(`Daftar_Gaji_GTK_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Bersihkan cache dan pulihkan ke data default GTK yang bersih
  const handleResetCache = () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_GAJI_KEY);
    } catch (e) {}
    setGajiList(INITIAL_GAJI_LIST);
    showNotification('success', 'Cache data gaji telah dibersihkan dan dipulihkan ke data pegawai GTK');
  };

  return (
    <div className="space-y-4">
      {/* Toast Notifikasi */}
      {notification && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${
          notification.type === 'success' 
            ? 'bg-emerald-600 text-white' 
            : 'bg-rose-600 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Table Card (UI Sesuai Biodata) */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200/80 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Data Gaji GTK</h2>
                <p className="text-xs text-slate-500">Pencatatan rincian gaji pokok dan penerimaan bersih pegawai</p>
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
                  title="Smart Impor Excel Gaji GTK (sheet: gaji)"
                >
                  <Sparkles className="w-4 h-4 text-emerald-100" />
                  <span>Smart Impor</span>
                </button>
              </div>
            )}
          </div>

          {/* Search Bar & Column Toggle */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200/80">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari berdasarkan NIP, Nama, atau Status..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowColumnToggle(!showColumnToggle)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 shadow-2xs transition-colors shrink-0 cursor-pointer"
                title="Atur kolom yang ditampilkan"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                <span>Kolom</span>
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200/80 text-xs">
            <span className="font-semibold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Filter:
            </span>

            {/* Bulan Filter */}
            {uniqueBulanList.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600 font-medium">Bulan:</span>
                <select
                  value={selectedBulan}
                  onChange={(e) => {
                    setSelectedBulan(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  {uniqueBulanList.map((bln) => (
                    <option key={bln} value={bln}>
                      {bln}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 font-medium">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                {uniqueStatusList.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Filter Button */}
            {(selectedStatus !== 'Semua' || selectedBulan !== 'Semua' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('Semua');
                  setSelectedBulan('Semua');
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="text-rose-600 hover:text-rose-800 font-bold underline px-1.5 py-1 cursor-pointer"
              >
                Reset Filter
              </button>
            )}

            <div className="ml-auto flex items-center gap-2 text-slate-500">
              <span>
                Menampilkan <strong className="text-slate-900">{filteredData.length}</strong> dari {enrichedGajiList.length} pegawai
              </span>
            </div>
          </div>

          {/* Column Toggle Box */}
          {showColumnToggle && (
            <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 flex flex-wrap gap-4 text-xs animate-in fade-in">
              <span className="font-semibold text-emerald-900 self-center">Pilih Kolom Tampil:</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={visibleColumns.nip}
                  onChange={(e) => setVisibleColumns((p) => ({ ...p, nip: e.target.checked }))}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>NIP</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={visibleColumns.nama}
                  onChange={(e) => setVisibleColumns((p) => ({ ...p, nama: e.target.checked }))}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Nama</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={visibleColumns.bulan}
                  onChange={(e) => setVisibleColumns((p) => ({ ...p, bulan: e.target.checked }))}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Bulan</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={visibleColumns.status}
                  onChange={(e) => setVisibleColumns((p) => ({ ...p, status: e.target.checked }))}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Status</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={visibleColumns.gajiPokok}
                  onChange={(e) => setVisibleColumns((p) => ({ ...p, gajiPokok: e.target.checked }))}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Gaji Pokok</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={visibleColumns.jumKotor}
                  onChange={(e) => setVisibleColumns((p) => ({ ...p, jumKotor: e.target.checked }))}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Jumlah Kotor</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={visibleColumns.jumBersih}
                  onChange={(e) => setVisibleColumns((p) => ({ ...p, jumBersih: e.target.checked }))}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Jumlah Bersih</span>
              </label>
            </div>
          )}
        </div>

        {/* Tabel Data Gaji (Clean Table Grid Layout Sesuai Biodata) */}
        <div className="overflow-x-auto relative w-full border-t border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-semibold text-xs border-b border-slate-300">
                <th className="py-2.5 px-3 w-12 text-center border-r border-slate-300">No</th>
                {visibleColumns.nip && (
                  <th className="py-2.5 px-3 min-w-[170px] border-r border-slate-300 font-semibold">NIP</th>
                )}
                {visibleColumns.nama && (
                  <th className="py-2.5 px-4 min-w-[220px] border-r border-slate-300 font-bold">Nama</th>
                )}
                {visibleColumns.bulan && (
                  <th className="py-2.5 px-3 min-w-[130px] text-center border-r border-slate-300 font-semibold">Bulan</th>
                )}
                {visibleColumns.status && (
                  <th className="py-2.5 px-3 min-w-[120px] text-center border-r border-slate-300 font-semibold">Status</th>
                )}
                {visibleColumns.gajiPokok && (
                  <th className="py-2.5 px-4 min-w-[150px] text-right border-r border-slate-300 font-semibold">Gaji Pokok</th>
                )}
                {visibleColumns.jumKotor && (
                  <th className="py-2.5 px-4 min-w-[150px] text-right border-r border-slate-300 font-semibold">Jumlah Kotor</th>
                )}
                {visibleColumns.jumBersih && (
                  <th className="py-2.5 px-4 min-w-[150px] text-right border-r border-slate-300 font-semibold">Jumlah Bersih</th>
                )}
                <th className="py-2.5 px-3 text-center sticky right-0 bg-slate-100 shadow-xs w-24 border-l border-slate-300 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500 italic">
                    <Banknote className="w-10 h-10 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-600">Tidak ada data gaji yang sesuai.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian, filter bulan, atau filter status.</p>
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, idx) => {
                  const itemIndex = (currentPage - 1) * itemsPerPage + idx + 1;
                  return (
                    <tr
                      key={`gaji-row-${item.id || item.nip}-${idx}`}
                      className="bg-white hover:bg-slate-50 transition-colors border-b border-slate-200"
                    >
                      <td className="py-2.5 px-3 text-center text-slate-500 border-r border-slate-200 font-medium">
                        {itemIndex}
                      </td>

                      {visibleColumns.nip && (
                        <td className="py-2.5 px-3 text-slate-700 border-r border-slate-200">
                          {item.nip || '-'}
                        </td>
                      )}

                      {visibleColumns.nama && (
                        <td className="py-2.5 px-4 text-slate-800 border-r border-slate-200">
                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            className="text-left hover:text-blue-600 hover:underline cursor-pointer"
                            title="Klik untuk lihat rincian gaji"
                          >
                            {item.displayNama}
                          </button>
                        </td>
                      )}

                      {visibleColumns.bulan && (
                        <td className="py-2.5 px-3 text-center border-r border-slate-200 text-slate-700">
                          {item.displayBulan || item.bulan || '-'}
                        </td>
                      )}

                      {visibleColumns.status && (
                        <td className="py-2.5 px-3 text-center border-r border-slate-200 text-slate-700">
                          {item.displayStatus}
                        </td>
                      )}

                      {visibleColumns.gajiPokok && (
                        <td className="py-2.5 px-4 text-right text-slate-700 border-r border-slate-200">
                          {formatRupiah(item.numGajiPokok)}
                        </td>
                      )}

                      {visibleColumns.jumKotor && (
                        <td className="py-2.5 px-4 text-right text-slate-700 border-r border-slate-200">
                          {formatRupiah(item.numJumKotor)}
                        </td>
                      )}

                      {visibleColumns.jumBersih && (
                        <td className="py-2.5 px-4 text-right text-slate-800 font-semibold border-r border-slate-200">
                          {formatRupiah(item.numJumBersih)}
                        </td>
                      )}

                      <td className="py-2.5 px-3 text-center sticky right-0 bg-white shadow-xs border-l border-slate-200">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            className="p-1 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Lihat Rincian Gaji"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenModal(item)}
                                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Data Gaji"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteItem(item)}
                                className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Hapus Data Gaji"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Total Footer Row */}
            {paginatedData.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={1 + (visibleColumns.nip ? 1 : 0) + (visibleColumns.nama ? 1 : 0) + (visibleColumns.bulan ? 1 : 0)} className="py-3 px-4 text-right border-r border-slate-300">
                    Total Keseluruhan Halaman Ini:
                  </td>
                  {visibleColumns.status && <td className="py-3 px-3 text-center border-r border-slate-300">-</td>}
                  {visibleColumns.gajiPokok && (
                    <td className="py-3 px-4 text-right font-bold text-slate-800 border-r border-slate-300">
                      {formatRupiah(paginatedData.reduce((acc, curr) => acc + curr.numGajiPokok, 0))}
                    </td>
                  )}
                  {visibleColumns.jumKotor && (
                    <td className="py-3 px-4 text-right font-bold text-slate-800 border-r border-slate-300">
                      {formatRupiah(paginatedData.reduce((acc, curr) => acc + curr.numJumKotor, 0))}
                    </td>
                  )}
                  {visibleColumns.jumBersih && (
                    <td className="py-3 px-4 text-right font-bold text-slate-900 border-r border-slate-300">
                      {formatRupiah(paginatedData.reduce((acc, curr) => acc + curr.numJumBersih, 0))}
                    </td>
                  )}
                  <td className="py-3 px-3 bg-slate-100 border-l border-slate-300"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Tampilkan</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>data per halaman</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">
              Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL FORM TAMBAH / EDIT DATA GAJI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {editingItem ? 'Edit Data Gaji GTK' : 'Tambah Data Gaji GTK'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Kunci utama: NIP & dipadankan dengan data sheet "gtk"
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-4 sm:p-5 space-y-4 text-xs">
              {/* Pilihan NIP GTK */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Pilih Pegawai (NIP & Nama dari Sheet GTK) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.nip}
                  onChange={(e) => handleSelectNIP(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  required
                >
                  <option value="">-- Pilih Pegawai dari Sheet GTK --</option>
                  {gtkList.map((g) => (
                    <option key={`opt-${g.nip}-${g.id}`} value={g.nip}>
                      {g.nip} - {g.nama} ({g.statusKepegawaian || 'PNS'})
                    </option>
                  ))}
                </select>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Atau ketik manual NIP jika belum ada di GTK:</span>
                </div>
                <input
                  type="text"
                  placeholder="Ketik NIP manual jika belum ada..."
                  value={formData.nip}
                  onChange={(e) => setFormData((p) => ({ ...p, nip: e.target.value }))}
                  className="w-full mt-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Nama Terisi Otomatis */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Pegawai (Otomatis dari Sheet GTK)
                </label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) => setFormData((p) => ({ ...p, nama: e.target.value }))}
                  placeholder="Nama pegawai..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Bulan / Periode Gaji */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Bulan / Periode Gaji <span className="text-rose-500">*</span></span>
                  <span className="text-slate-400 font-normal text-[11px]">Header "Bulan" di Sheet</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.bulan}
                    onChange={(e) => setFormData((p) => ({ ...p, bulan: e.target.value }))}
                    placeholder="Contoh: Oktober 2026, November 2026..."
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                  <select
                    onChange={(e) => {
                      if (e.target.value) setFormData((p) => ({ ...p, bulan: e.target.value }));
                    }}
                    value=""
                    className="px-2.5 py-2 border border-slate-300 rounded-xl bg-slate-50 text-slate-700 text-xs cursor-pointer focus:outline-hidden"
                    title="Pilih contoh bulan"
                  >
                    <option value="">Pilihan Cepat...</option>
                    <option value="Januari 2026">Januari 2026</option>
                    <option value="Februari 2026">Februari 2026</option>
                    <option value="Maret 2026">Maret 2026</option>
                    <option value="April 2026">April 2026</option>
                    <option value="Mei 2026">Mei 2026</option>
                    <option value="Juni 2026">Juni 2026</option>
                    <option value="Juli 2026">Juli 2026</option>
                    <option value="Agustus 2026">Agustus 2026</option>
                    <option value="September 2026">September 2026</option>
                    <option value="Oktober 2026">Oktober 2026</option>
                    <option value="November 2026">November 2026</option>
                    <option value="Desember 2026">Desember 2026</option>
                  </select>
                </div>
              </div>

              {/* Gaji Pokok */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Gaji Pokok (Gaji_Pokok)</span>
                  <span className="text-emerald-700 font-mono font-bold">
                    {formatRupiah(formData.gajiPokok || 0)}
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.gajiPokok || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, gajiPokok: Number(e.target.value) || 0 }))}
                  placeholder="Masukkan nominal gaji pokok..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              {/* Jumlah Kotor */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Jumlah Kotor (Jum_Kotor)</span>
                  <span className="text-indigo-700 font-mono font-bold">
                    {formatRupiah(formData.jumKotor || 0)}
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.jumKotor || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, jumKotor: Number(e.target.value) || 0 }))}
                  placeholder="Masukkan nominal jumlah kotor..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              {/* Jumlah Bersih */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Jumlah Bersih (Jum_bersih)</span>
                  <span className="text-emerald-700 font-mono font-bold">
                    {formatRupiah(formData.jumBersih || 0)}
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.jumBersih || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, jumBersih: Number(e.target.value) || 0 }))}
                  placeholder="Masukkan nominal jumlah bersih yang diterima..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-slate-800 font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{isSaving ? 'Menyimpan...' : 'Simpan Data'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETAIL RINCIAN GAJI */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-emerald-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Rincian Slip Gaji GTK</h3>
                  <p className="text-[11px] text-emerald-800">
                    Informasi terpadu NIP Sheet Gaji & GTK
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-emerald-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">NIP Pegawai</span>
                  <span className="font-mono font-bold text-slate-800">{detailItem.nip}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Nama Lengkap</span>
                  <span className="font-semibold text-slate-900 text-right">
                    {detailItem.displayNama || detailItem.nama}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Bulan / Periode Gaji</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    <Calendar className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>{detailItem.displayBulan || detailItem.bulan || '-'}</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Status Kepegawaian</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                    {detailItem.displayStatus || detailItem.status || 'PNS'}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-600 font-medium">Gaji Pokok:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatRupiah(detailItem.numGajiPokok || detailItem.gaji_pokok || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-600 font-medium">Jumlah Kotor (Bruto):</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatRupiah(detailItem.numJumKotor || detailItem.jum_kotor || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                  <span className="font-bold">Jumlah Bersih (Netto):</span>
                  <span className="font-mono font-bold text-base text-emerald-700">
                    {formatRupiah(detailItem.numJumBersih || detailItem.jum_bersih || 0)}
                  </span>
                </div>
              </div>

              <div className="pt-2 text-right">
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-slate-900">Hapus Data Gaji?</h3>
              <p className="text-xs text-slate-500">
                Data gaji untuk NIP <strong>{deleteItem.nip}</strong> ({deleteItem.displayNama || deleteItem.nama}) akan dihapus.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteItem(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSaving}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-xs"
              >
                {isSaving ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Import Modal Gaji GTK */}
      <GTKGajiImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentGajiList={gajiList}
        onApplyImport={handleApplyImportGaji}
      />
    </div>
  );
};
