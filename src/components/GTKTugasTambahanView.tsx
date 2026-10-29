import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Briefcase,
  Search,
  Filter,
  Download,
  Users,
  CheckCircle2,
  Calendar,
  ChevronRight,
  ChevronDown,
  Eye,
  X,
  RotateCcw,
  Sparkles,
  Phone,
  Mail,
  GraduationCap,
  Clock,
  Layers,
  LayoutGrid,
  List
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { GTKData, WaliKelas, AppTheme, AppConfig } from '../types';
import { isUserRole, isAdminRole, normalizeNip } from '../utils/authUtils';
import {
  isBendaharaBosBop,
  normalizeRawTugasString,
  classifyTugasCategory
} from '../utils/tugasTambahanUtils';
import { TugasTambahanImportModal } from './TugasTambahanImportModal';
import { syncAllGTKDirectly, syncAllPTKDirectly } from '../services/sheetsSync';
import { safeSetItem } from '../utils/storage';

interface GTKTugasTambahanViewProps {
  gtkList?: GTKData[];
  waliKelasList?: WaliKelas[];
  currentUser?: GTKData | null;
  theme?: AppTheme;
  appConfig?: AppConfig;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onImportGTK?: (newList: GTKData[]) => void;
}

interface ParsedTugasItem {
  id: string;
  namaTugas: string;
  kategori: string;
  jam?: string | number;
}

interface EnrichedGTKTugas {
  gtk: GTKData;
  nama: string;
  nip: string;
  nuptk: string;
  status: string;
  jenisPtk: string;
  noHp: string;
  email: string;
  tugasList: ParsedTugasItem[];
  rawTugasString: string;
}

// Helper untuk membersihkan gelar akademik agar pencocokan nama akurat
const cleanPersonName = (n: string): string => {
  return (n || '')
    .toLowerCase()
    .replace(/,\s*(s\.?pd|s\.?kom|m\.?pd|s\.?e|s\.?t|s\.?ag|m\.?si|drs\.?|dr\.?|h\.?|hj\.?|gr\.?|s\.?sos|m\.?kom|m\.?ti)/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

export const GTKTugasTambahanView: React.FC<GTKTugasTambahanViewProps> = ({
  gtkList = [],
  waliKelasList = [],
  currentUser,
  theme = 'aurora-glass',
  appConfig,
  onRefresh,
  isRefreshing = false,
  onImportGTK
}) => {
  const isGlass = theme === 'aurora-glass';
  const isUser = isUserRole(currentUser);
  const isAdmin = !currentUser || isAdminRole(currentUser);

  // State pencarian & filter berbasis dropdown + ketik
  const [selectedTugas, setSelectedTugas] = useState<string>('');
  const [selectedGtk, setSelectedGtk] = useState<string>('');
  const [isOpenTugas, setIsOpenTugas] = useState<boolean>(false);
  const [isOpenGtk, setIsOpenGtk] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedDetailGTK, setSelectedDetailGTK] = useState<EnrichedGTKTugas | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleApplyImportTugas = async (
    finalList: GTKData[],
    mode: 'merge' | 'replace',
    stats: { matchingCount: number; newCount: number; retainedCount: number; finalTotal: number },
    rawPtkRows?: any[]
  ) => {
    safeSetItem('dapodik_cached_gtk', finalList);
    if (onImportGTK) {
      onImportGTK(finalList);
    }
    showNotification(
      mode === 'merge'
        ? `Smart Impor berhasil! ${stats.matchingCount} data PTK & tugas tambahan diperbarui, ${stats.newCount} PTK baru ditambahkan.`
        : `Impor Ganti Semua berhasil! Total ${finalList.length} data PTK tersimpan.`
    );
    if (appConfig?.webAppUrl) {
      try {
        const payloadItems = rawPtkRows && rawPtkRows.length > 0 ? rawPtkRows : finalList;
        await syncAllPTKDirectly(appConfig.webAppUrl, payloadItems, mode);
        // Sinkronkan juga ringkasan tugasTambahan dan jamTugasTambahan ke sheet gtk
        await syncAllGTKDirectly(appConfig.webAppUrl, finalList, mode).catch(() => {});
      } catch (err) {
        console.warn('Sync PTK tugas tambahan ke Google Sheets:', err);
      }
    }
  };

  const tugasRef = useRef<HTMLDivElement>(null);
  const gtkRef = useRef<HTMLDivElement>(null);

  // Tutup dropdown jika klik di luar area
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tugasRef.current && !tugasRef.current.contains(e.target as Node)) {
        setIsOpenTugas(false);
      }
      if (gtkRef.current && !gtkRef.current.contains(e.target as Node)) {
        setIsOpenGtk(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Kompilasi dan normalisasi seluruh data GTK beserta tugas tambahannya
  const enrichedList: EnrichedGTKTugas[] = useMemo(() => {
    return (gtkList || []).map((gtk, gIdx) => {
      const tugasItems: ParsedTugasItem[] = [];
      const rawTugas = (gtk.tugasTambahan || '').trim();

      // 1. Ekstrak dari field tugasTambahan GTK (Bendahara BOS dan BOP dinormalisasi menjadi 1 tugas: Bendahara BOS/BOP)
      if (rawTugas && rawTugas !== '-') {
        const normalizedTasks = normalizeRawTugasString(rawTugas);
        normalizedTasks.forEach((itemText, sIdx) => {
          tugasItems.push({
            id: `${gtk.nip || gtk.nuptk || gIdx}-tugas-${sIdx}`,
            namaTugas: itemText,
            kategori: classifyTugasCategory(itemText),
            jam: gtk.jamTugasTambahan || ''
          });
        });
      }

      // 2. Sinkronkan dengan waliKelasList jika ada penugasan wali kelas
      if (waliKelasList && Array.isArray(waliKelasList)) {
        const cleanedGtkNama = cleanPersonName(gtk.nama || '');
        const matchedWali = waliKelasList.find(w => {
          const matchByNip = gtk.nip && w.nip && normalizeNip(gtk.nip) === normalizeNip(w.nip);
          const matchByName = w.nama && cleanPersonName(w.nama) === cleanedGtkNama;
          return matchByNip || matchByName;
        });

        if (matchedWali) {
          const waliLabel = matchedWali.kelas ? `Wali Kelas ${matchedWali.kelas}` : 'Wali Kelas';
          const alreadyHasWali = tugasItems.some(t => t.namaTugas.toLowerCase().includes('wali kelas'));
          if (!alreadyHasWali) {
            tugasItems.unshift({
              id: `${gtk.nip || gtk.nuptk || gIdx}-wali`,
              namaTugas: waliLabel,
              kategori: 'Wali Kelas'
            });
          }
        }
      }

      return {
        gtk,
        nama: gtk.nama || '-',
        nip: gtk.nip || '-',
        nuptk: gtk.nuptk || '-',
        status: gtk.statusKepegawaian || 'PNS',
        jenisPtk: gtk.jenisPtk || 'Guru',
        noHp: gtk.hp || gtk.telepon || '-',
        email: gtk.email || '-',
        tugasList: tugasItems,
        rawTugasString: tugasItems.map(t => t.namaTugas).join(', ')
      };
    });
  }, [gtkList, waliKelasList]);

  // Hanya ambil GTK yang memiliki minimal 1 tugas tambahan untuk analisis utama
  const activeTugasGTKList = useMemo(() => {
    return enrichedList.filter(item => item.tugasList.length > 0);
  }, [enrichedList]);

  // Ekstrak semua jenis nama tugas yang unik untuk keperluan autocomplete
  const uniqueTugasNames = useMemo(() => {
    const set = new Set<string>();
    enrichedList.forEach(item => {
      item.tugasList.forEach(t => set.add(t.namaTugas));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [enrichedList]);

  // Ekstrak semua nama GTK yang unik untuk keperluan autocomplete
  const uniqueGtkNames = useMemo(() => {
    const set = new Set<string>();
    enrichedList.forEach(item => {
      if (item.nama && item.nama !== '-') set.add(item.nama);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [enrichedList]);

  // Daftar opsi tugas tambahan untuk dropdown (tanpa pengelompokan kategori penugasan)
  const tugasDropdownList = useMemo(() => {
    const set = new Set<string>();
    // Tambahkan opsi umum seperti Wali Kelas, Guru Piket, atau Bendahara BOS/BOP bila ada dalam data
    const generalRoles = ['Wali Kelas', 'Guru Piket', 'Bendahara BOS/BOP'];
    generalRoles.forEach(role => {
      const exists = enrichedList.some(item =>
        item.tugasList.some(
          t => t.kategori.toLowerCase() === role.toLowerCase() ||
               t.namaTugas.toLowerCase().includes(role.toLowerCase()) ||
               (role === 'Bendahara BOS/BOP' && isBendaharaBosBop(t.namaTugas))
        )
      );
      if (exists) set.add(role);
    });

    // Tambahkan seluruh jenis nama tugas yang ada
    uniqueTugasNames.forEach(t => {
      set.add(t);
    });

    return Array.from(set);
  }, [enrichedList, uniqueTugasNames]);

  // Daftar GTK terurut A-Z untuk dropdown nama guru
  const sortedGtkList = useMemo(() => {
    return [...enrichedList]
      .filter(item => item.nama && item.nama !== '-')
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [enrichedList]);

  // Cek apakah filter sedang aktif
  const isTugasActive = Boolean(selectedTugas && selectedTugas !== 'Semua' && selectedTugas.trim() !== '');
  const isGtkActive = Boolean(selectedGtk && selectedGtk !== 'Semua' && selectedGtk.trim() !== '');

  // Opsi tugas tambahan yang difilter saat user mengetik
  const filteredTugasOptions = useMemo(() => {
    if (!isTugasActive) return tugasDropdownList;
    const q = selectedTugas.toLowerCase().trim();
    const isQBendahara = isBendaharaBosBop(q);
    return tugasDropdownList.filter(t => {
      if (isQBendahara && isBendaharaBosBop(t)) return true;
      return t.toLowerCase().includes(q);
    });
  }, [tugasDropdownList, selectedTugas, isTugasActive]);

  // Opsi guru yang difilter saat user mengetik
  const filteredGtkOptions = useMemo(() => {
    if (!isGtkActive) return sortedGtkList;
    const q = selectedGtk.toLowerCase().trim();
    return sortedGtkList.filter(item => 
      item.nama.toLowerCase().includes(q) || 
      cleanPersonName(item.nama).toLowerCase().includes(q)
    );
  }, [sortedGtkList, selectedGtk, isGtkActive]);

  // Filter Data berdasarkan input teks atau pilihan dropdown
  const filteredData = useMemo(() => {
    return enrichedList.filter(item => {
      // 1. Jika memfilter Guru tertentu (bisa dari klik atau ketikan teks)
      if (isGtkActive) {
        const targetGtk = selectedGtk.trim().toLowerCase();
        const matchGtk =
          item.nama.toLowerCase() === targetGtk ||
          cleanPersonName(item.nama).toLowerCase() === targetGtk ||
          item.nama.toLowerCase().includes(targetGtk) ||
          cleanPersonName(item.nama).toLowerCase().includes(targetGtk) ||
          (item.nip && normalizeNip(item.nip).includes(targetGtk));
        if (!matchGtk) return false;
      }

      // 2. Jika memfilter Tugas tertentu (bisa dari klik atau ketikan teks)
      if (isTugasActive) {
        const targetTugas = selectedTugas.trim().toLowerCase();
        const isTargetBendahara = isBendaharaBosBop(targetTugas);
        const hasTugas = item.tugasList.some(t => {
          if (isTargetBendahara && isBendaharaBosBop(t.namaTugas)) {
            return true;
          }
          return (
            t.kategori.toLowerCase() === targetTugas ||
            t.namaTugas.toLowerCase() === targetTugas ||
            t.namaTugas.toLowerCase().includes(targetTugas) ||
            t.kategori.toLowerCase().includes(targetTugas)
          );
        });
        if (!hasTugas) return false;
      }

      // Default jika tidak ada filter aktif: tampilkan GTK yang memiliki tugas tambahan
      if (!isTugasActive && !isGtkActive) {
        return item.tugasList.length > 0;
      }

      return true;
    });
  }, [enrichedList, selectedTugas, selectedGtk, isTugasActive, isGtkActive]);

  // Fungsi untuk mengambil HANYA tugas yang dicari jika sedang memfilter tugas tertentu
  const getMatchingTasks = (item: EnrichedGTKTugas): ParsedTugasItem[] => {
    if (!isTugasActive) {
      return item.tugasList;
    }
    const target = selectedTugas.trim().toLowerCase();
    const isTargetBendahara = isBendaharaBosBop(target);
    const matched = item.tugasList.filter(t => {
      if (isTargetBendahara && isBendaharaBosBop(t.namaTugas)) {
        return true;
      }
      return (
        t.namaTugas.toLowerCase().includes(target) ||
        t.kategori.toLowerCase().includes(target)
      );
    });
    return matched.length > 0 ? matched : item.tugasList;
  };

  // Judul kolom header tugas tambahan dinamis
  const headerTugasTitle = useMemo(() => {
    if (!isTugasActive) return 'Tugas Tambahan';
    if (isBendaharaBosBop(selectedTugas)) return 'Bendahara BOS/BOP';
    return selectedTugas;
  }, [isTugasActive, selectedTugas]);

  // Cek apakah pencarian saat ini spesifik merujuk pada SATU guru (dari pilihan atau ketikan nama GTK)
  const singleSearchedGTK = useMemo(() => {
    if (isGtkActive) {
      const target = selectedGtk.trim().toLowerCase();
      const exactMatch = enrichedList.find(
        item => item.nama.toLowerCase() === target || cleanPersonName(item.nama).toLowerCase() === target
      );
      if (exactMatch) return exactMatch;
      if (filteredData.length === 1) return filteredData[0];
    }
    return null;
  }, [isGtkActive, selectedGtk, enrichedList, filteredData]);

  // Handler saat memilih / mengetik Tugas
  const handleTugasSelect = (val: string) => {
    setSelectedTugas(val);
    setIsOpenTugas(false);
    if (val && val !== 'Semua') {
      setSelectedGtk(''); // Reset nama guru agar fokus ke daftar guru tugas ini
    }
  };

  // Handler saat memilih / mengetik Nama Guru
  const handleGtkSelect = (val: string) => {
    setSelectedGtk(val);
    setIsOpenGtk(false);
    if (val && val !== 'Semua') {
      setSelectedTugas(''); // Reset tugas agar fokus ke guru ini
    }
  };

  // Reset semua filter pencarian kembali ke default
  const handleResetSearch = () => {
    setSelectedTugas('');
    setSelectedGtk('');
    setIsOpenTugas(false);
    setIsOpenGtk(false);
  };

  // Ekspor ke Excel (.xlsx) dengan 2 sheet:
  // Sheet 1: Daftar GTK dengan rincian tugas tambahan
  // Sheet 2: Rekap Per Tugas Tambahan (Header = Nama-nama Tugas Tambahan, Data = Nama-nama GTK)
  const handleExportExcel = () => {
    // --- SHEET 1: Data Rincian GTK ---
    const headersSheet1 = [
      'No',
      'Nama GTK',
      'NIP',
      'NUPTK',
      'Status Kepegawaian',
      'Jenis PTK',
      'Daftar Tugas Tambahan',
      'Jumlah Tugas',
      'No. HP / Telepon'
    ];

    const rowsSheet1 = filteredData.map((item, idx) => [
      idx + 1,
      item.nama,
      item.nip,
      item.nuptk,
      item.status,
      item.jenisPtk,
      item.tugasList.map((t, tIdx) => `${tIdx + 1}. ${t.namaTugas}`).join('; '),
      item.tugasList.length,
      item.noHp
    ]);

    const worksheet1 = XLSX.utils.aoa_to_sheet([headersSheet1, ...rowsSheet1]);
    worksheet1['!cols'] = [
      { wch: 5 },
      { wch: 30 },
      { wch: 22 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 45 },
      { wch: 14 },
      { wch: 18 }
    ];

    // --- SHEET 2: Matriks Per Tugas Tambahan (Header: Nama Tugas Tambahan, Data: Nama GTK) ---
    const taskColumnsMap: Record<string, string[]> = {};

    activeTugasGTKList.forEach(item => {
      item.tugasList.forEach(t => {
        let colHeader = t.namaTugas.trim();
        let displayVal = item.nama;

        // Normalisasi nama tugas di header sheet
        if (isBendaharaBosBop(colHeader)) {
          colHeader = 'Bendahara BOS/BOP';
        } else if (t.kategori === 'Wali Kelas' || colHeader.toLowerCase().startsWith('wali kelas')) {
          colHeader = 'Wali Kelas';
          const matchKelas = t.namaTugas.match(/wali kelas\s+(.+)/i);
          const kelas = matchKelas ? matchKelas[1].trim() : '';
          displayVal = kelas ? `${item.nama} (${kelas})` : item.nama;
        } else if (t.kategori === 'Guru Piket' || colHeader.toLowerCase().includes('piket')) {
          colHeader = 'Guru Piket';
        }

        if (!taskColumnsMap[colHeader]) {
          taskColumnsMap[colHeader] = [];
        }

        if (!taskColumnsMap[colHeader].includes(displayVal)) {
          taskColumnsMap[colHeader].push(displayVal);
        }
      });
    });

    // Urutkan kolom header: tugas umum di awal, disusul tugas lainnya secara alfabetis
    const priorityHeaders = ['Wali Kelas', 'Guru Piket', 'Bendahara BOS/BOP'].filter(h => Boolean(taskColumnsMap[h]));
    const otherHeaders = Object.keys(taskColumnsMap)
      .filter(h => !['Wali Kelas', 'Guru Piket', 'Bendahara BOS/BOP'].includes(h))
      .sort((a, b) => a.localeCompare(b, 'id'));
    const headersSheet2 = [...priorityHeaders, ...otherHeaders];

    // Hitung baris terbanyak
    const maxRows = headersSheet2.length > 0
      ? Math.max(...headersSheet2.map(h => taskColumnsMap[h]?.length || 0))
      : 0;

    const rowsSheet2: string[][] = [];
    for (let r = 0; r < maxRows; r++) {
      const row = headersSheet2.map(h => taskColumnsMap[h]?.[r] || '');
      rowsSheet2.push(row);
    }

    const worksheet2 = XLSX.utils.aoa_to_sheet([headersSheet2, ...rowsSheet2]);
    worksheet2['!cols'] = headersSheet2.map(h => {
      const maxLen = Math.max(
        h.length,
        ...(taskColumnsMap[h] || []).map(val => val.length)
      );
      return { wch: Math.max(maxLen + 3, 22) };
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet1, 'Tugas Tambahan GTK');
    XLSX.utils.book_append_sheet(workbook, worksheet2, 'Rekap Per Tugas');
    XLSX.writeFile(workbook, `Tugas_Tambahan_GTK_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Badge warna kategori tugas
  const getCategoryBadgeClass = (kategori: string) => {
    switch (kategori) {
      case 'Wali Kelas':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Guru Piket':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Manajemen':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Kepala Lab / Bengkel':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Perpustakaan':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'Bimbingan Konseling':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Pembina Ekstra':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Bendahara BOS/BOP':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div
        className={`p-5 rounded-2xl border transition-all duration-300 ${
          isGlass
            ? 'bg-white/80 backdrop-blur-md border-white/60 shadow-xl shadow-purple-900/5'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                Tugas Tambahan GTK
              </h2>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Smart Impor data tugas tambahan dari Excel"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>Smart Impor</span>
              </button>
            )}

            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Unduh data dalam format Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar Berbasis Dropdown */}
      <div
        className={`p-4 rounded-2xl border transition-all duration-300 ${
          isGlass
            ? 'bg-white/80 backdrop-blur-md border-white/60 shadow-xl shadow-purple-900/5'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Input & Dropdown Pencarian 2 Arah (Bisa Memilih dan Mengetik) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            {/* 1. Input + Dropdown Tugas Tambahan */}
            <div className="relative" ref={tugasRef}>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Pencarian Tugas Tambahan:</span>
                </span>
                {isTugasActive && (
                  <button
                    type="button"
                    onClick={() => handleTugasSelect('')}
                    className="text-[10px] text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    Hapus
                  </button>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={selectedTugas === 'Semua' ? '' : selectedTugas}
                  onChange={(e) => {
                    setSelectedTugas(e.target.value);
                    setIsOpenTugas(true);
                    if (selectedGtk) setSelectedGtk('');
                  }}
                  onFocus={() => setIsOpenTugas(true)}
                  placeholder="Ketik atau pilih tugas (misal: Wali Kelas)..."
                  className={`w-full pl-3 pr-14 py-2 text-xs rounded-xl border transition-all font-medium ${
                    isTugasActive
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/30 text-indigo-950 font-semibold'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
                  }`}
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {isTugasActive && (
                    <button
                      type="button"
                      onClick={() => handleTugasSelect('')}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                      title="Hapus pencarian tugas"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOpenTugas(!isOpenTugas)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                    title="Buka / tutup daftar tugas"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpenTugas ? 'rotate-180 text-indigo-600' : ''}`} />
                  </button>
                </div>

                {/* Dropdown Menu Popup Tugas Tambahan */}
                {isOpenTugas && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in">
                    <button
                      type="button"
                      onClick={() => handleTugasSelect('')}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                        !isTugasActive ? 'font-semibold text-indigo-600 bg-indigo-50/50' : 'text-slate-600'
                      }`}
                    >
                      <span>-- Semua Tugas Tambahan --</span>
                    </button>
                    {filteredTugasOptions.length > 0 ? (
                      filteredTugasOptions.map(tugas => (
                        <button
                          key={tugas}
                          type="button"
                          onClick={() => handleTugasSelect(tugas)}
                          className={`w-full px-3 py-2 text-left text-xs hover:bg-indigo-50/60 transition-colors cursor-pointer ${
                            selectedTugas.toLowerCase() === tugas.toLowerCase()
                              ? 'font-semibold text-indigo-600 bg-indigo-50/50'
                              : 'text-slate-800'
                          }`}
                        >
                          {tugas}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2.5 text-xs text-slate-400 italic">
                        Tidak ada tugas yang cocok
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Input + Dropdown Nama Guru / GTK */}
            <div className="relative" ref={gtkRef}>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pencarian Nama Guru / GTK:</span>
                </span>
                {isGtkActive && (
                  <button
                    type="button"
                    onClick={() => handleGtkSelect('')}
                    className="text-[10px] text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    Hapus
                  </button>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={selectedGtk === 'Semua' ? '' : selectedGtk}
                  onChange={(e) => {
                    setSelectedGtk(e.target.value);
                    setIsOpenGtk(true);
                    if (selectedTugas) setSelectedTugas('');
                  }}
                  onFocus={() => setIsOpenGtk(true)}
                  placeholder="Ketik atau pilih nama guru..."
                  className={`w-full pl-3 pr-14 py-2 text-xs rounded-xl border transition-all font-medium ${
                    isGtkActive
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30 text-emerald-950 font-semibold'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {isGtkActive && (
                    <button
                      type="button"
                      onClick={() => handleGtkSelect('')}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                      title="Hapus pencarian nama"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOpenGtk(!isOpenGtk)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                    title="Buka / tutup daftar guru"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpenGtk ? 'rotate-180 text-emerald-600' : ''}`} />
                  </button>
                </div>

                {/* Dropdown Menu Popup Nama Guru (Tanpa Jumlah Tugas) */}
                {isOpenGtk && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in">
                    <button
                      type="button"
                      onClick={() => handleGtkSelect('')}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                        !isGtkActive ? 'font-semibold text-emerald-600 bg-emerald-50/50' : 'text-slate-600'
                      }`}
                    >
                      <span>-- Semua Guru / GTK --</span>
                    </button>
                    {filteredGtkOptions.length > 0 ? (
                      filteredGtkOptions.map(item => (
                        <button
                          key={item.nama}
                          type="button"
                          onClick={() => handleGtkSelect(item.nama)}
                          className={`w-full px-3 py-2 text-left text-xs hover:bg-emerald-50/60 transition-colors cursor-pointer ${
                            selectedGtk.toLowerCase() === item.nama.toLowerCase()
                              ? 'font-semibold text-emerald-600 bg-emerald-50/50'
                              : 'text-slate-800'
                          }`}
                        >
                          {item.nama}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2.5 text-xs text-slate-400 italic">
                        Tidak ada guru yang cocok
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tombol Aksi: Reset & View Mode */}
          <div className="flex items-center gap-2 self-end lg:self-center shrink-0 pt-1 lg:pt-0">
            {(isTugasActive || isGtkActive) && (
              <button
                type="button"
                onClick={handleResetSearch}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Reset semua filter ke default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}

            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilan Tabel"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilan Kartu"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kartu</span>
              </button>
            </div>
          </div>
        </div>

        {/* Info Khusus Guru yang Dipilih (Format penomoran 1, 2, dst) */}
        {singleSearchedGTK && (
          <div className="mt-3.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 text-sm">{singleSearchedGTK.nama}</span>
              <span className="text-[11px] text-slate-500">{singleSearchedGTK.tugasList.length} Tugas Tambahan</span>
            </div>
            <div className="pt-2 border-t border-slate-200">
              <span className="font-medium text-slate-600 block mb-1 text-[11px]">Daftar Tugas Tambahan:</span>
              {singleSearchedGTK.tugasList.length > 0 ? (
                <div className="space-y-1 text-slate-800 font-normal pl-1">
                  {singleSearchedGTK.tugasList.map((t, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-slate-500 shrink-0">{idx + 1}.</span>
                      <span>{t.namaTugas}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">Tidak ada tugas tambahan terdaftar</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Konten Utama: Tabel atau Grid Kartu */}
      {viewMode === 'table' ? (
        <div
          className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
            isGlass
              ? 'bg-white/80 backdrop-blur-md border-white/60 shadow-xl shadow-purple-900/5'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-medium border-b border-slate-200">
                  <th className="py-2.5 px-3 w-14 text-center border-r border-slate-200">No</th>
                  <th className="py-2.5 px-4 min-w-[220px] border-r border-slate-200">Nama</th>
                  <th className="py-2.5 px-4 min-w-[320px]">
                    {headerTugasTitle}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-10 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Briefcase className="w-8 h-8 text-slate-300" />
                        <p className="font-normal text-slate-600 text-sm">Tidak ditemukan data tugas tambahan</p>
                        <button
                          type="button"
                          onClick={handleResetSearch}
                          className="mt-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-normal hover:bg-slate-200 cursor-pointer"
                        >
                          Tampilkan Semua Tugas
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item, index) => {
                    const displayedTasks = getMatchingTasks(item);
                    return (
                      <tr
                        key={item.gtk.id || item.nip || index}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        {/* No */}
                        <td className="py-2.5 px-3 text-center text-slate-700 font-normal border-r border-slate-200">
                          {index + 1}
                        </td>

                        {/* Nama */}
                        <td className="py-2.5 px-4 text-slate-800 font-normal border-r border-slate-200">
                          {item.nama}
                        </td>

                        {/* Tugas Tambahan: Munculkan hanya tugas yang dicari jika filter tugas aktif */}
                        <td className="py-2.5 px-4 text-slate-800 font-normal">
                          {displayedTasks.length > 0 ? (
                            <div className="space-y-1">
                              {displayedTasks.map((tugas, tIdx) => (
                                <div key={tugas.id || tIdx} className="flex items-start gap-1.5">
                                  {displayedTasks.length > 1 && (
                                    <span className="text-slate-500 shrink-0">{tIdx + 1}.</span>
                                  )}
                                  <span>{tugas.namaTugas}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Bar */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Menampilkan <strong>{filteredData.length}</strong> data GTK
            </span>
          </div>
        </div>
      ) : (
        /* Tampilan Grid Kartu */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredData.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600 text-sm">Tidak ditemukan data tugas tambahan</p>
              <button
                onClick={handleResetSearch}
                className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 cursor-pointer"
              >
                Tampilkan Semua Tugas
              </button>
            </div>
          ) : (
            filteredData.map((item, index) => (
              <div
                key={item.gtk.id || item.nip || index}
                className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                  isGlass
                    ? 'bg-white/80 backdrop-blur-md border-white/60 shadow-md hover:shadow-lg shadow-purple-900/5'
                    : 'bg-white border-slate-200 shadow-sm hover:shadow-md'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                        {item.nama.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm leading-tight line-clamp-1">{item.nama}</h3>
                        <span className="text-[10px] text-slate-500">
                          {item.status} • {item.jenisPtk}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                      {item.tugasList.length} Tugas
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 mb-3 pb-2 border-b border-slate-100">
                    NIP: {item.nip}
                  </div>

                  {/* List Tugas */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">
                      Penugasan:
                    </span>
                    {item.tugasList.length > 0 ? (
                      <ol className="list-decimal list-inside space-y-1 text-slate-800 text-xs">
                        {item.tugasList.map((tugas, tIdx) => (
                          <li key={tugas.id || tIdx} className="leading-snug">
                            <span className="font-semibold">{tugas.namaTugas}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-slate-400 italic text-[11px]">- Tidak ada tugas tambahan -</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  {item.noHp && item.noHp !== '-' ? (
                    <a
                      href={`https://wa.me/${item.noHp.replace(/^0/, '62').replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 hover:underline flex items-center gap-1 font-medium text-[11px]"
                    >
                      <Phone className="w-3 h-3" />
                      <span>{item.noHp}</span>
                    </a>
                  ) : (
                    <span className="text-slate-400 text-[11px]">Tanpa kontak</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedDetailGTK(item)}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold text-[11px] flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Detail</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal Detail GTK & Tugas Tambahan */}
      {selectedDetailGTK && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div
            className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl transition-all ${
              isGlass ? 'bg-white/95 backdrop-blur-md border-white' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <Briefcase className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Rincian Tugas Tambahan GTK</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailGTK(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              {/* Profil Singkat */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 text-sm block">{selectedDetailGTK.nama}</span>
                <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px] pt-1">
                  <div>
                    <span className="text-slate-400 block">NIP:</span>
                    <span className="font-semibold text-slate-800">{selectedDetailGTK.nip}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Status:</span>
                    <span className="font-semibold text-slate-800">{selectedDetailGTK.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Jenis PTK:</span>
                    <span className="font-semibold text-slate-800">{selectedDetailGTK.jenisPtk}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">No. HP / WA:</span>
                    <span className="font-semibold text-slate-800">{selectedDetailGTK.noHp}</span>
                  </div>
                </div>
              </div>

              {/* Daftar Tugas Tambahan */}
              <div>
                <span className="font-bold text-slate-700 block mb-2 text-xs">
                  Daftar Tugas Tambahan yang Diemban ({selectedDetailGTK.tugasList.length}):
                </span>
                {selectedDetailGTK.tugasList.length > 0 ? (
                  <div className="space-y-2">
                    {selectedDetailGTK.tugasList.map((tugas, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl border border-slate-200/80 bg-white flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-slate-800">{tugas.namaTugas}</span>
                        </div>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded font-medium border shrink-0 ${getCategoryBadgeClass(
                            tugas.kategori
                          )}`}
                        >
                          {tugas.kategori}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Tidak ada tugas tambahan terdaftar untuk GTK ini
                  </p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDetailGTK(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{notification}</span>
        </div>
      )}

      {/* Smart Import Modal Tugas Tambahan */}
      <TugasTambahanImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentGtkList={gtkList}
        onApplyImport={handleApplyImportTugas}
      />
    </div>
  );
};
