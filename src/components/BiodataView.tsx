import React, { useState, useMemo, useRef } from 'react';
import { 
  Search, 
  Filter, 
  FileSpreadsheet,
  Eye, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  SlidersHorizontal, 
  X,
  UserCheck,
  FileText,
  AlertCircle,
  Layers,
  Users,
  ShieldCheck,
  ChevronDown,
  Upload,
  Download,
  CheckCircle2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, WaliKelas, Jurusan, GTKData, AppConfig } from '../types';
import { INITIAL_WALI_KELAS, INITIAL_WALI_KELAS_LIST } from '../data/initialWaliKelas';
import { INITIAL_JURUSAN_LIST, getJurusanByKelas } from '../data/initialJurusan';
import { isUserRole } from '../utils/authUtils';
import { 
  ALL_DOWNLOAD_COLUMNS, 
  getGTKAllowedDownloadHeaders,
  DEFAULT_GTK_ALLOWED_DOWNLOAD_HEADERS,
  fetchGTKAllowedDownloadHeadersFromServer
} from '../data/gtkDownloadColumns';
import { GTKDownloadHeadersModal } from './GTKDownloadHeadersModal';
import { DAPODIK_DATA_HEADERS, studentToDapodikRow, dapodikRowToStudent } from '../data/dapodikHeaders';
import { syncAllStudentsDirectly } from '../services/sheetsSync';

interface BiodataViewProps {
  students: Student[];
  waliKelasMap?: Record<string, string>;
  waliKelasList?: WaliKelas[];
  jurusanList?: Jurusan[];
  webAppUrl?: string;
  appConfig?: AppConfig;
  currentUser?: GTKData | null;
  allowedGtkHeaders?: string[];
  onUpdateAllowedGtkHeaders?: (keys: string[]) => void;
  onImportStudents?: (newStudents: Student[]) => void;
  onAddStudent: () => void;
  onEditStudent: (student: Student) => void;
  onDeleteStudent: (id: string) => void;
  onViewStudent: (student: Student) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const BiodataView: React.FC<BiodataViewProps> = ({
  students,
  waliKelasMap = INITIAL_WALI_KELAS,
  waliKelasList = INITIAL_WALI_KELAS_LIST,
  jurusanList = INITIAL_JURUSAN_LIST,
  webAppUrl,
  appConfig,
  currentUser,
  allowedGtkHeaders: propAllowedGtkHeaders,
  onUpdateAllowedGtkHeaders,
  onImportStudents,
  onAddStudent,
  onEditStudent,
  onDeleteStudent,
  onViewStudent,
  onRefresh,
  isRefreshing
}) => {
  const isUser = isUserRole(currentUser);

  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKelas, setSelectedKelas] = useState('Semua');
  const [selectedJK, setSelectedJK] = useState('Semua');
  const [selectedAgama, setSelectedAgama] = useState('Semua');
  const [selectedStatus, setSelectedStatus] = useState('Semua'); // BARU: Filter Status

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Allowed GTK Download Headers state (managed by Admin, synchronized with server)
  const [allowedGtkHeaders, setAllowedGtkHeaders] = useState<string[]>(() => {
    return propAllowedGtkHeaders && propAllowedGtkHeaders.length > 0
      ? propAllowedGtkHeaders
      : getGTKAllowedDownloadHeaders();
  });
  const [isGtkHeadersModalOpen, setIsGtkHeadersModalOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Modal Impor Data Excel Sheet Data (69 Kolom) State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedStudents, setImportedStudents] = useState<Student[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge'); // Default: Smart Merge
  const [importError, setImportError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Sync if prop from parent updates
  React.useEffect(() => {
    if (propAllowedGtkHeaders && propAllowedGtkHeaders.length > 0) {
      setAllowedGtkHeaders(propAllowedGtkHeaders);
    }
  }, [propAllowedGtkHeaders]);

  // Always fetch latest allowed download headers from server on mount
  React.useEffect(() => {
    let isMounted = true;
    fetchGTKAllowedDownloadHeadersFromServer(webAppUrl).then((headers) => {
      if (isMounted && headers && headers.length > 0) {
        setAllowedGtkHeaders(headers);
        if (onUpdateAllowedGtkHeaders) {
          onUpdateAllowedGtkHeaders(headers);
        }
      }
    });

    const handleCustomUpdate = (e: any) => {
      if (isMounted && e.detail && Array.isArray(e.detail) && e.detail.length > 0) {
        setAllowedGtkHeaders(e.detail);
        if (onUpdateAllowedGtkHeaders) {
          onUpdateAllowedGtkHeaders(e.detail);
        }
      }
    };

    window.addEventListener('gtk_download_headers_updated', handleCustomUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener('gtk_download_headers_updated', handleCustomUpdate);
    };
  }, [webAppUrl, onUpdateAllowedGtkHeaders]);

  // Column visibility state (default all standard columns visible for Admin)
  const [visibleColumns, setVisibleColumns] = useState({
    nama: true,
    kelas: true,
    nipd: true,
    nisn: true,
    jk: true,
    tempatLahir: true,
    tanggalLahir: true,
    agama: true,
    alamat: true,
    ayah: true,
    pekerjaanAyah: true,
    ibu: true,
    pekerjaanIbu: true,
    status: true,
  });

  const [showColumnToggle, setShowColumnToggle] = useState(false);

  // Check if a column should be rendered in table
  const isColVisible = (colKey: string) => {
    if (isUser) {
      return allowedGtkHeaders.includes(colKey);
    }
    return Boolean(visibleColumns[colKey as keyof typeof visibleColumns]);
  };

  // Unique lists for dropdown filters with natural alphabetical & numerical sorting
  const uniqueClasses = useMemo(() => {
    const classList = students.map((s) => s.kelas).filter((k): k is string => Boolean(k));
    const set = new Set<string>(classList);
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return ['Semua', ...sorted];
  }, [students]);

  const uniqueAgama = useMemo(() => {
    const agamaList = students.map((s) => s.agama).filter((a): a is string => Boolean(a));
    const set = new Set<string>(agamaList);
    return ['Semua', ...Array.from(set).sort()];
  }, [students]);

  // BARU: Unique Status list
  const uniqueStatus = useMemo(() => {
    const statusList = students.map((s) => s.status || 'Aktif').filter((s): s is string => Boolean(s));
    const set = new Set<string>(statusList);
    return ['Semua', ...Array.from(set).sort()];
  }, [students]);

  // Filter students based on search and filters
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      // Search query match
      const query = searchQuery.toLowerCase().trim();
      const matchQuery =
        !query ||
        (student.nama || '').toLowerCase().includes(query) ||
        (student.nipd || '').toLowerCase().includes(query) ||
        (student.nisn || '').toLowerCase().includes(query) ||
        (student.alamat || '').toLowerCase().includes(query) ||
        (student.ayah || (student as any).nama_ayah || '').toLowerCase().includes(query) ||
        (student.pekerjaanAyah || (student as any).kerja_ayah || (student as any).kerjaayah || '').toLowerCase().includes(query) ||
        (student.ibu || (student as any).nama_ibu || '').toLowerCase().includes(query) ||
        (student.pekerjaanIbu || (student as any).kerja_ibu || (student as any).kerjaibu || '').toLowerCase().includes(query) ||
        (student.tempatLahir || '').toLowerCase().includes(query);

      // Class match
      const matchKelas = selectedKelas === 'Semua' || student.kelas === selectedKelas;

      // JK match
      const matchJK = selectedJK === 'Semua' || student.jk === selectedJK;

      // Agama match
      const matchAgama = selectedAgama === 'Semua' || student.agama === selectedAgama;

      // BARU: Status match
      const matchStatus = selectedStatus === 'Semua' || (student.status || 'Aktif') === selectedStatus;

      return matchQuery && matchKelas && matchJK && matchAgama && matchStatus;
    });
  }, [students, searchQuery, selectedKelas, selectedJK, selectedAgama, selectedStatus]);

  // Pagination calculations
  const totalItems = filteredStudents.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredStudents.slice(start, start + itemsPerPage);
  }, [filteredStudents, currentPage, itemsPerPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Export Excel Handler with configurable columns
  const handleExportExcel = (forceAsGTK = false) => {
    const isExportingAsGTK = isUser || forceAsGTK;
    const activeHeaders = isExportingAsGTK 
      ? allowedGtkHeaders 
      : ALL_DOWNLOAD_COLUMNS.map((c) => c.key);
    
    // Filter columns in defined order that are permitted
    const exportColumns = ALL_DOWNLOAD_COLUMNS.filter((col) => activeHeaders.includes(col.key));

    const excelData = filteredStudents.map((student, idx) => {
      const row: Record<string, any> = {
        'No': idx + 1,
      };

      for (const col of exportColumns) {
        row[col.headerName] = col.getValue(student, idx);
      }

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set professional column widths
    const colWidths = [
      { wch: 6 }, // No
      ...exportColumns.map((c) => ({ wch: c.excelWidth }))
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    const sheetName = selectedKelas !== 'Semua' ? selectedKelas.substring(0, 31) : 'Biodata Siswa';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const dateStr = new Date().toISOString().split('T')[0];
    const modeSuffix = isExportingAsGTK ? (isUser ? '' : '_Format_GTK') : '_Lengkap';
    const fileName = selectedKelas !== 'Semua'
      ? `Biodata_Siswa_${selectedKelas.replace(/[^a-zA-Z0-9]/g, '_')}${modeSuffix}_${dateStr}.xlsx`
      : `Biodata_Siswa_SMKN1_Palopo${modeSuffix}_${dateStr}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    setExportDropdownOpen(false);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Unduh Template Excel Lengkap 69 Kolom Sheet "data" Dapodik
  const handleDownloadDapodikTemplate = () => {
    const dataToExport = students.length > 0
      ? students.map(studentToDapodikRow)
      : [
          studentToDapodikRow({
            id: 'STU-1',
            nama: 'CONTOH NAMA SISWA',
            kelas: 'X RPL 1',
            nipd: '212210001',
            nisn: '0061234567',
            jk: 'L',
            tempatLahir: 'Palopo',
            tanggalLahir: '2006-05-12',
            agama: 'Islam',
            alamat: 'Jl. Pemuda No. 10',
            ayah: 'Nama Ayah',
            ibu: 'Nama Ibu',
            pekerjaanAyah: 'Wiraswasta',
            pekerjaanIbu: 'Ibu Rumah Tangga',
            status: 'Aktif',
            ket: ''
          })
        ];

    const worksheet = XLSX.utils.json_to_sheet(dataToExport, {
      header: [...DAPODIK_DATA_HEADERS]
    });

    // Format SEMUA sel sebagai text string ('@') agar NISN, NIPD, NIK, No. Rek tidak kehilangan nol atau jadi notasi ilmiah
    Object.keys(worksheet).forEach((cellKey) => {
      if (cellKey.startsWith('!')) return;
      worksheet[cellKey].t = 's';
      worksheet[cellKey].z = '@';
    });

    // Atur lebar kolom yang proporsional
    worksheet['!cols'] = DAPODIK_DATA_HEADERS.map((h) => {
      if (h === 'Nama' || h === 'nama_ayah' || h === 'nama_ibu' || h === 'namawali') return { wch: 28 };
      if (h === 'Alamat' || h === 'sekolah_asal') return { wch: 32 };
      if (h === 'NIK' || h === 'nik_ayah' || h === 'nik_ibu' || h === 'no_kk') return { wch: 20 };
      if (h === 'NISN' || h === 'NIPD' || h === 'no_ujian' || h === 'no_ijazah') return { wch: 16 };
      return { wch: 14 };
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'data');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Template_Biodata_Siswa_Sheet_data_${dateStr}.xlsx`);
  };

  // Membaca dan validasi file Excel impor (sheet: data, 69 kolom)
  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        // Baca file dengan raw: false dan cellText: true agar SEMUA tipe data murni teks string
        const workbook = XLSX.read(buffer, { type: 'array', cellText: true, raw: false });

        // Temukan sheet 'data' atau gunakan sheet pertama
        const targetSheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === 'data') || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[targetSheetName];

        if (!worksheet) {
          throw new Error('Sheet data dalam berkas Excel tidak terbaca atau kosong.');
        }

        // Ambil data dalam bentuk array of objects dengan nilai string murni
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { 
          raw: false,
          defval: '' 
        });

        if (rawJson.length === 0) {
          throw new Error('Berkas Excel tidak memiliki baris data.');
        }

        const parsedRows: Student[] = [];
        rawJson.forEach((row, idx) => {
          const student = dapodikRowToStudent(row, idx);
          // Siswa valid jika memiliki nama, NISN, atau NIPD
          if (student.nama || student.nisn || student.nipd) {
            parsedRows.push(student);
          }
        });

        if (parsedRows.length === 0) {
          throw new Error('Tidak ada baris data siswa yang valid. Pastikan header sesuai dengan sheet "data" (Nama, NIPD, JK, NISN, dll).');
        }

        setImportedStudents(parsedRows);
      } catch (err: any) {
        setImportError(err?.message || 'Gagal membaca berkas Excel. Pastikan format kolom sesuai dengan 69 header sheet data.');
        setImportedStudents([]);
      }
    };

    reader.onerror = () => {
      setImportError('Gagal membaca file dari penyimpanan.');
      setImportedStudents([]);
    };

    reader.readAsArrayBuffer(file);
  };

  // Helper untuk mencocokkan siswa berdasarkan NISN, NIPD, atau Nama
  const findMatchingStudentIndex = (list: Student[], target: Student) => {
    const targetNisn = (target.nisn || '').trim();
    const targetNipd = (target.nipd || '').trim();
    const targetNama = (target.nama || '').trim().toLowerCase();

    return list.findIndex((s) => {
      const sNisn = (s.nisn || '').trim();
      const sNipd = (s.nipd || '').trim();
      const sNama = (s.nama || '').trim().toLowerCase();

      if (targetNisn && sNisn && targetNisn === sNisn) return true;
      if (targetNipd && sNipd && targetNipd === sNipd) return true;
      if (targetNama && sNama && targetNama === sNama && targetNama.length > 2) {
        if (target.tanggalLahir && s.tanggalLahir) {
          return target.tanggalLahir === s.tanggalLahir;
        }
        return true;
      }
      return false;
    });
  };

  // Analisis statistik kecocokan data impor terhadap data saat ini
  const importStats = useMemo(() => {
    if (importedStudents.length === 0) {
      return { matchingCount: 0, newCount: 0, existingCount: students.length, retainedCount: students.length, finalTotal: students.length };
    }

    let matching = 0;
    importedStudents.forEach((imp) => {
      const idx = findMatchingStudentIndex(students, imp);
      if (idx !== -1) matching++;
    });

    const newCount = importedStudents.length - matching;
    const existingCount = students.length;
    const retainedCount = existingCount - matching;
    const finalTotal = importMode === 'merge' ? existingCount + newCount : importedStudents.length;

    return {
      matchingCount: matching,
      newCount,
      existingCount,
      retainedCount: retainedCount >= 0 ? retainedCount : 0,
      finalTotal
    };
  }, [importedStudents, students, importMode]);

  // Eksekusi Simpan Hasil Impor ke State & Google Sheets (Mendukung Smart Merge & Replace All)
  const handleApplyImport = async () => {
    if (importedStudents.length === 0) return;

    setIsImporting(true);
    setImportError(null);

    try {
      let finalStudents: Student[] = [];

      if (importMode === 'merge') {
        // Smart Merge: Gabungkan data
        const merged = [...students];
        let updatedCount = 0;
        let addedCount = 0;

        importedStudents.forEach((imp, i) => {
          const matchIdx = findMatchingStudentIndex(merged, imp);
          if (matchIdx !== -1) {
            // Perbarui data yang sudah ada, pertahankan id dan data verval jika di Excel kosong
            const prev = merged[matchIdx];
            merged[matchIdx] = {
              ...prev,
              ...imp,
              id: prev.id,
              status: imp.status || prev.status || 'Aktif',
              ket: imp.ket || prev.ket || '',
              timestamp: imp.timestamp || prev.timestamp || '',
              vervalOleh: imp.vervalOleh || prev.vervalOleh || ''
            };
            updatedCount++;
          } else {
            // Tambahkan sebagai siswa baru
            merged.push({
              ...imp,
              id: imp.id || imp.nipd || imp.nisn || `STU-${Date.now()}-${i + 1}`,
              status: imp.status || 'Aktif'
            });
            addedCount++;
          }
        });
        finalStudents = merged;
      } else {
        // Timpa Total (Replace All)
        finalStudents = importedStudents.map((s, idx) => ({
          ...s,
          id: s.id || s.nipd || s.nisn || `STU-IMP-${idx + 1}`
        }));
      }

      // 1. Simpan ke state komponen induk & localStorage
      if (onImportStudents) {
        onImportStudents(finalStudents);
      }

      // 2. Sinkronisasi ke Express Server (/api/students/import) & Google Sheets (sheet "data")
      const targetUrl = webAppUrl || appConfig?.webAppUrl || '';
      const syncRes = await syncAllStudentsDirectly(targetUrl, finalStudents);

      const successMsg = importMode === 'merge'
        ? (syncRes.message || `Smart Merge Berhasil! ${importStats.matchingCount} data diperbarui, ${importStats.newCount} siswa baru ditambahkan. Total: ${finalStudents.length} siswa.`)
        : (syncRes.message || `Berhasil menimpa seluruh data dengan ${finalStudents.length} peserta didik dari Excel.`);

      setNotification({
        type: 'success',
        message: successMsg
      });

      // Tutup modal setelah delay singkat
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportedStudents([]);
        setImportFileName('');
        if (importFileInputRef.current) {
          importFileInputRef.current.value = '';
        }
      }, 1400);
    } catch (err: any) {
      setImportError(err?.message || 'Terjadi kesalahan saat menyimpan data impor ke server.');
    } finally {
      setIsImporting(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* Notifikasi Status */}
      {notification && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border shadow-xs animate-in fade-in duration-200 ${
          notification.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <p className="text-xs font-semibold">{notification.message}</p>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white border border-slate-300 rounded-xl shadow-2xs overflow-hidden w-full">
        {/* Controls Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4 bg-slate-50/50">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari berdasarkan Nama, NIPD, NISN, Alamat..."
                className="w-full pl-10 pr-9 py-2.5 bg-white rounded-xl border border-slate-300 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Export Excel Button */}
              {!isUser ? (
                <div className="relative inline-flex rounded-xl shadow-2xs">
                  <button
                    onClick={() => handleExportExcel(false)}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-l-xl border border-emerald-600 transition-colors shrink-0 cursor-pointer"
                    title="Ekspor seluruh data siswa lengkap ke file Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Ekspor Excel</span>
                  </button>
                  <button
                    onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                    className="px-2 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-r-xl border-l border-emerald-500 transition-colors shrink-0 cursor-pointer"
                    title="Opsi ekspor Excel"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {exportDropdownOpen && (
                    <div 
                      className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleExportExcel(false)}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between font-semibold cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          Ekspor Semua Kolom (Admin)
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">19 Kolom</span>
                      </button>
                      <button
                        onClick={() => handleExportExcel(true)}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between text-slate-700 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-indigo-600" />
                          Uji Ekspor Format GTK
                        </span>
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold border border-indigo-100">
                          {allowedGtkHeaders.length} Kolom
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => handleExportExcel(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl border border-emerald-600 shadow-2xs transition-colors shrink-0 cursor-pointer"
                  title={`Ekspor data siswa ke Excel (${allowedGtkHeaders.length} kolom diizinkan oleh Admin)`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Ekspor Excel</span>
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-emerald-800/80 text-emerald-100 rounded-full">
                    {allowedGtkHeaders.length} Kolom
                  </span>
                </button>
              )}

              {/* Impor Data Excel Button (Khusus Admin) */}
              {!isUser && (
                <button
                  onClick={() => {
                    setImportedStudents([]);
                    setImportFileName('');
                    setImportError(null);
                    setIsImportModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-2xs transition-colors shrink-0 cursor-pointer"
                  title="Impor data Biodata Peserta Didik (sheet data - 69 kolom)"
                >
                  <Upload className="w-4 h-4" />
                  <span>Impor Data Excel</span>
                </button>
              )}

              {/* Admin Button: Atur Header Download GTK */}
              {!isUser && (
                <button
                  onClick={() => setIsGtkHeadersModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl border border-indigo-200 shadow-2xs transition-colors shrink-0 cursor-pointer"
                  title="Atur kolom apa saja yang diizinkan untuk diunduh oleh GTK yang login sebagai User"
                >
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Atur Header Download GTK</span>
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
                    {allowedGtkHeaders.length}
                  </span>
                </button>
              )}

              {!isUser && (
                <button
                  onClick={() => setShowColumnToggle(!showColumnToggle)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 shadow-2xs transition-colors shrink-0 cursor-pointer"
                  title="Atur kolom yang ditampilkan"
                >
                  <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                  <span>Kolom</span>
                </button>
              )}
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200/80 text-xs">
            <span className="font-semibold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Filter:
            </span>

            {/* Class Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 font-medium">Kelas:</span>
              <select
                value={selectedKelas}
                onChange={(e) => {
                  setSelectedKelas(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                {uniqueClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            {/* Gender Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 font-medium">JK:</span>
              <select
                value={selectedJK}
                onChange={(e) => {
                  setSelectedJK(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Semua">Semua (L/P)</option>
                <option value="L">Laki-Laki (L)</option>
                <option value="P">Perempuan (P)</option>
              </select>
            </div>

            {/* Agama Filter (Hanya Admin) */}
            {!isUser && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600 font-medium">Agama:</span>
                <select
                  value={selectedAgama}
                  onChange={(e) => {
                    setSelectedAgama(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  {uniqueAgama.map((agm) => (
                    <option key={agm} value={agm}>
                      {agm}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* BARU: Status Filter (Hanya Admin) */}
            {!isUser && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600 font-medium">Status:</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  {uniqueStatus.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Reset Filters */}
            {(selectedKelas !== 'Semua' || selectedJK !== 'Semua' || (!isUser && selectedAgama !== 'Semua') || (!isUser && selectedStatus !== 'Semua') || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedKelas('Semua');
                  setSelectedJK('Semua');
                  setSelectedAgama('Semua');
                  setSelectedStatus('Semua'); // BARU: Reset Status
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="text-rose-600 hover:text-rose-800 font-bold underline px-2 py-1"
              >
                Reset Filter
              </button>
            )}

            <div className="ml-auto text-slate-500">
              Menampilkan <strong className="text-slate-900">{filteredStudents.length}</strong> dari {students.length} siswa
            </div>
          </div>

          {/* Column Toggles Dropdown Modal (Admin Only) */}
          {!isUser && showColumnToggle && (
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-lg space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-bold text-xs text-slate-800">Tampilkan / Sembunyikan Kolom Tabel:</span>
                <button
                  onClick={() => setShowColumnToggle(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                {Object.keys(visibleColumns).map((colKey) => (
                  <label
                    key={colKey}
                    className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50 border border-slate-100"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[colKey as keyof typeof visibleColumns]}
                      onChange={() =>
                        setVisibleColumns((prev) => ({
                          ...prev,
                          [colKey]: !prev[colKey as keyof typeof visibleColumns],
                        }))
                      }
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="capitalize font-medium text-slate-700">
                      {colKey === 'jk'
                        ? 'JK'
                        : colKey === 'nipd'
                        ? 'NIPD'
                        : colKey === 'nisn'
                        ? 'NISN'
                        : colKey === 'tempatLahir'
                        ? 'Tempat Lahir'
                        : colKey === 'tanggalLahir'
                        ? 'Tanggal Lahir'
                        : colKey === 'pekerjaanAyah'
                        ? 'Pekerjaan Ayah'
                        : colKey === 'pekerjaanIbu'
                        ? 'Pekerjaan Ibu'
                        : colKey === 'status'
                        ? 'Status'
                        : colKey}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Data Table - Clean Grid Style (Columns auto-fit content length) */}
        <div className="overflow-x-auto relative w-full border border-slate-200 rounded-xl shadow-xs">
            <table className="w-max min-w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-semibold text-xs border-b border-slate-300">
                  <th className="py-2.5 px-3 text-center whitespace-nowrap border-r border-slate-300">No</th>
                  {isColVisible('nama') && <th className="py-2.5 px-4 whitespace-nowrap border-r border-slate-300 font-bold">Nama</th>}
                  {isColVisible('kelas') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Kelas</th>}
                  {isColVisible('nipd') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">NIPD</th>}
                  {isColVisible('nisn') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">NISN</th>}
                  {isColVisible('jk') && <th className="py-2.5 px-3 text-center whitespace-nowrap border-r border-slate-300">JK</th>}
                  {isColVisible('tempatLahir') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Tempat Lahir</th>}
                  {isColVisible('tanggalLahir') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Tanggal Lahir</th>}
                  {isColVisible('agama') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Agama</th>}
                  {isColVisible('alamat') && <th className="py-2.5 px-4 whitespace-nowrap border-r border-slate-300">Alamat</th>}
                  {isColVisible('ayah') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Ayah</th>}
                  {isColVisible('pekerjaanAyah') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Pekerjaan Ayah</th>}
                  {isColVisible('ibu') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Ibu</th>}
                  {isColVisible('pekerjaanIbu') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Pekerjaan Ibu</th>}
                  {isColVisible('noHp') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">No HP</th>}
                  {isColVisible('email') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Email</th>}
                  {isColVisible('sekolahAsal') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Sekolah Asal</th>}
                  {isColVisible('status') && <th className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300">Status</th>}
                  {isColVisible('ket') && <th className="py-2.5 px-3 whitespace-nowrap">Keterangan</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-800">
                {paginatedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={1 + ['nama', 'kelas', 'nipd', 'nisn', 'jk', 'tempatLahir', 'tanggalLahir', 'agama', 'alamat', 'ayah', 'pekerjaanAyah', 'ibu', 'pekerjaanIbu', 'noHp', 'email', 'sekolahAsal', 'status', 'ket'].filter(isColVisible).length} className="py-12 text-center text-slate-500">
                      <div className="max-w-xs mx-auto space-y-2">
                        <UserCheck className="w-8 h-8 mx-auto text-slate-300" />
                        <p className="font-semibold text-slate-700">Tidak ada data siswa ditemukan</p>
                        <p className="text-xs text-slate-400">Coba ubah kata kunci pencarian atau reset filter.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((student, idx) => {
                    const itemIndex = (currentPage - 1) * itemsPerPage + idx + 1;
                    return (
                      <tr
                        key={student.id ? `${student.id}-${idx}` : `stu-${idx}`}
                        className="hover:bg-slate-50 transition-colors border-b border-slate-200"
                      >
                        <td className="py-2.5 px-3 text-center text-slate-500 font-medium whitespace-nowrap border-r border-slate-200">
                          {itemIndex}
                        </td>

                        {/* 1. Nama */}
                        {isColVisible('nama') && (
                          <td className="py-2.5 px-4 font-semibold text-slate-800 hover:text-indigo-600 transition-colors whitespace-nowrap border-r border-slate-200">
                            <button
                              onClick={() => onViewStudent(student)}
                              className="text-left hover:underline focus:outline-hidden cursor-pointer whitespace-nowrap block"
                            >
                              {student.nama}
                            </button>
                          </td>
                        )}

                        {/* 2. Kelas */}
                        {isColVisible('kelas') && (
                          <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.kelas}
                          </td>
                        )}

                        {/* 3. NIPD */}
                        {isColVisible('nipd') && (
                          <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.nipd}
                          </td>
                        )}

                        {/* 4. NISN */}
                        {isColVisible('nisn') && (
                          <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.nisn}
                          </td>
                        )}

                        {/* 5. JK */}
                        {isColVisible('jk') && (
                          <td className="py-2.5 px-3 text-center font-medium text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.jk || '-'}
                          </td>
                        )}

                        {/* 6. Tempat Lahir */}
                        {isColVisible('tempatLahir') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.tempatLahir || '-'}
                          </td>
                        )}

                        {/* 7. Tanggal Lahir */}
                        {isColVisible('tanggalLahir') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {formatDate(student.tanggalLahir)}
                          </td>
                        )}

                        {/* 8. Agama */}
                        {isColVisible('agama') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.agama || '-'}
                          </td>
                        )}

                        {/* 9. Alamat */}
                        {isColVisible('alamat') && (
                          <td className="py-2.5 px-4 text-slate-800 whitespace-nowrap border-r border-slate-200" title={student.alamat}>
                            {student.alamat || '-'}
                          </td>
                        )}

                        {/* 10. Ayah */}
                        {isColVisible('ayah') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.ayah || (student as any).nama_ayah || (student as any).namaayah || '-'}
                          </td>
                        )}

                        {/* 10b. Pekerjaan Ayah */}
                        {isColVisible('pekerjaanAyah') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.pekerjaanAyah || (student as any).kerja_ayah || (student as any).kerjaayah || (student as any).pekerjaan_ayah || '-'}
                          </td>
                        )}

                        {/* 11. Ibu */}
                        {isColVisible('ibu') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.ibu || (student as any).nama_ibu || (student as any).namaibu || '-'}
                          </td>
                        )}

                        {/* 11b. Pekerjaan Ibu */}
                        {isColVisible('pekerjaanIbu') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.pekerjaanIbu || (student as any).kerja_ibu || (student as any).kerjaibu || (student as any).pekerjaan_ibu || '-'}
                          </td>
                        )}

                        {/* 12. No HP */}
                        {isColVisible('noHp') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.noHp || '-'}
                          </td>
                        )}

                        {/* 13. Email */}
                        {isColVisible('email') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.email || '-'}
                          </td>
                        )}

                        {/* 14. Sekolah Asal */}
                        {isColVisible('sekolahAsal') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.sekolahAsal || '-'}
                          </td>
                        )}

                        {/* 15. Status (Tampilan Polosan tanpa highlight) */}
                        {isColVisible('status') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap border-r border-slate-200">
                            {student.status || 'Aktif'}
                          </td>
                        )}

                        {/* 16. Keterangan */}
                        {isColVisible('ket') && (
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                            {student.ket || '-'}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Tampilkan</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 bg-white rounded border border-slate-300 font-semibold text-slate-800"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>data per halaman</span>
          </div>

          <div className="flex items-center gap-2">
            <span>
              Halaman <strong className="text-slate-900">{currentPage}</strong> dari {totalPages}
            </span>

            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Pengaturan Header Download GTK (Admin Only) */}
      {!isUser && (
        <GTKDownloadHeadersModal
          isOpen={isGtkHeadersModalOpen}
          onClose={() => setIsGtkHeadersModalOpen(false)}
          currentAllowedKeys={allowedGtkHeaders}
          webAppUrl={webAppUrl}
          onSaveSuccess={(updatedKeys) => {
            setAllowedGtkHeaders(updatedKeys);
            if (onUpdateAllowedGtkHeaders) {
              onUpdateAllowedGtkHeaders(updatedKeys);
            }
          }}
        />
      )}

      {/* Modal Impor Biodata Peserta Didik (Sheet: data - 69 Kolom) */}
      {!isUser && isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200 shadow-2xs">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Impor Biodata Peserta Didik (Sheet: data)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Format resmi 69 kolom Dapodik. Seluruh kolom diproses murni sebagai teks (string).
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isImporting) {
                    setIsImportModalOpen(false);
                    setImportedStudents([]);
                    setImportFileName('');
                    setImportError(null);
                  }
                }}
                disabled={isImporting}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Petunjuk & Download Template Bar */}
              <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-indigo-950">
                    <p className="font-semibold text-slate-800">
                      Gunakan format 69 kolom resmi sheet &quot;data&quot; Dapodik:
                    </p>
                    <p className="text-slate-600 mt-0.5 text-[11px] leading-relaxed">
                      Nama, NIPD, JK, NISN, t_lahir, tgl_lahir, NIK, Agama, Alamat, RT, RW, Dusun, Kelurahan, Kecamatan, kode_pos, jenis_tinggal, transportaso, Telepon, HP, email, SKHUN, kps, no_kps, nama_ayah, thn_lahir_ayah, pend_ayah, kerja_ayah, pengh_ayah, nik_ayah, nama_ibu, thn_lahir_ibu, pend_ibu, kerja_ibu, pengh_ibu, nik_ibu, namawali, thnwali, pendwali, pekwali, pengwali, nikwali, rombel, no_ujian, no_ijazah, kip, no_kip, nama_kip, no_kks, reg_akta, Bank, no_rek, rek_nama, layak_pip, alasan, keb_khusus, sekolah_asal, anak_ke, Lintang, Bujur, no_kk, berat_badan, tinggi_badan, lingkar_kepala, jum_saudara, jarak_sekolah, status, ket, timestamp, verval_oleh.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDownloadDapodikTemplate}
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-indigo-700 font-semibold text-xs rounded-xl border border-indigo-300 shadow-2xs transition-colors shrink-0 cursor-pointer"
                  title="Unduh format template Excel dengan 69 kolom teks"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Template (69 Kolom)</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleImportFileChange}
                  className="hidden"
                />

                {!importFileName ? (
                  <div
                    onClick={() => importFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50 hover:bg-indigo-50/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                  >
                    <div className="p-3 bg-white group-hover:bg-indigo-100 rounded-full border border-slate-200 text-indigo-600 mb-3 shadow-2xs transition-colors">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      Klik untuk memilih file Excel (.xlsx / .xls)
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Pastikan file memiliki sheet bernama &quot;data&quot; dengan 69 kolom resmi Dapodik
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{importFileName}</p>
                        <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                          ✓ {importedStudents.length} baris peserta didik berhasil dibaca dari file
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImportedStudents([]);
                        setImportFileName('');
                        setImportError(null);
                        if (importFileInputRef.current) {
                          importFileInputRef.current.value = '';
                        }
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg border border-slate-300 transition-colors cursor-pointer"
                    >
                      Ganti File
                    </button>
                  </div>
                )}
              </div>

              {/* Error Message Box */}
              {importError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Gagal memproses file:</span> {importError}
                  </div>
                </div>
              )}

              {/* Mode Pilihan Impor & Analisis Smart Merge */}
              {importedStudents.length > 0 && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      <span>Metode Penggabungan Data:</span>
                    </label>
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                      {importMode === 'merge' ? 'Mode: Smart Merge (Aman)' : 'Mode: Timpa Total'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Opsi 1: Smart Merge (Recommended) */}
                    <div
                      onClick={() => setImportMode('merge')}
                      className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                        importMode === 'merge'
                          ? 'bg-indigo-50/80 border-indigo-600 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'merge'}
                          onChange={() => setImportMode('merge')}
                          className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800">Smart Merge</span>
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                              Direkomendasikan
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            Memperbarui data yang cocok (NISN / NIPD / Nama) dan menambahkan siswa baru. Siswa lama yang tidak ada di file Excel <strong>tetap aman tersimpan (tidak dihapus)</strong>.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Opsi 2: Replace All */}
                    <div
                      onClick={() => setImportMode('replace')}
                      className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                        importMode === 'replace'
                          ? 'bg-rose-50/80 border-rose-500 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'replace'}
                          onChange={() => setImportMode('replace')}
                          className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-slate-800">Timpa Total (Replace All)</span>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            Mengganti seluruh daftar siswa hanya dengan data yang ada di file Excel ini saja. Data siswa lama yang tidak ada di file <strong>akan terhapus</strong>.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ringkasan Analisis Data */}
                  <div className="p-3 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                        <span className="text-slate-600">Di Excel: <strong className="text-slate-800">{importedStudents.length}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                        <span className="text-slate-600">Akan Diperbarui: <strong className="text-amber-700">{importStats.matchingCount}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                        <span className="text-slate-600">Siswa Baru: <strong className="text-emerald-700">{importStats.newCount}</strong></span>
                      </div>
                      {importMode === 'merge' && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                          <span className="text-slate-600">Siswa Lama Aman: <strong className="text-slate-700">{importStats.retainedCount}</strong></span>
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                      Total Akhir: {importStats.finalTotal} Siswa
                    </div>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {importedStudents.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Pratinjau Data Siswa ({importedStudents.length} siswa siap diimpor):
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Menampilkan maks. 50 data teratas
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200 z-10 font-bold">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">No</th>
                          <th className="py-2.5 px-3 min-w-[150px]">Nama Siswa</th>
                          <th className="py-2.5 px-3 min-w-[100px]">NIPD</th>
                          <th className="py-2.5 px-3 min-w-[110px]">NISN</th>
                          <th className="py-2.5 px-3 w-14 text-center">JK</th>
                          <th className="py-2.5 px-3 min-w-[110px]">Rombel</th>
                          <th className="py-2.5 px-3 min-w-[130px]">Tempat/Tgl Lahir</th>
                          <th className="py-2.5 px-3 min-w-[130px]">NIK</th>
                          <th className="py-2.5 px-3 w-24 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importedStudents.slice(0, 50).map((st, i) => (
                          <tr key={st.id || i} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-400 font-medium">{i + 1}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800">{st.nama || '-'}</td>
                            <td className="py-2 px-3 text-slate-600 font-mono">{st.nipd || '-'}</td>
                            <td className="py-2 px-3 text-slate-600 font-mono">{st.nisn || '-'}</td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                st.jk === 'P' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {st.jk || 'L'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-700 font-medium">{st.kelas || '-'}</td>
                            <td className="py-2 px-3 text-slate-600">
                              {st.tempatLahir ? `${st.tempatLahir}, ` : ''}{formatDate(st.tanggalLahir)}
                            </td>
                            <td className="py-2 px-3 text-slate-600 font-mono">{st.nik || '-'}</td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                (st.status || 'Aktif') === 'Aktif'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}>
                                {st.status || 'Aktif'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500 font-medium">
                Tip: Semua angka NIK, NISN, NIPD diformat teks murni agar tidak terpotong.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportedStudents([]);
                    setImportFileName('');
                    setImportError(null);
                  }}
                  disabled={isImporting}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={importedStudents.length === 0 || isImporting}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                    importMode === 'merge' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyimpan ke Spreadsheet...</span>
                    </>
                  ) : importMode === 'merge' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Terapkan Smart Merge (Total: {importStats.finalTotal} Siswa)</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Terapkan Timpa Total ({importedStudents.length} Data)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};