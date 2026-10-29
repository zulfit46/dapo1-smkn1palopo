import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { GTKData } from '../types';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  RefreshCw, 
  Layers, 
  Briefcase, 
  Info, 
  ShieldCheck, 
  Eye
} from 'lucide-react';
import { formatToDDMMYYYY } from '../utils/dateUtils';

// 23 Header Resmi Sheet PTK sesuai instruksi
export const PTK_OFFICIAL_HEADERS = [
  'Nama',
  'NUPTK',
  'JK',
  'Tempat Lahir',
  'Tanggal Lahir',
  'NIP',
  'Status Kepegawaian',
  'Jenis PTK',
  'Gelar Depan',
  'Gelar Belakang',
  'Jenjang',
  'Jurusan/Prodi',
  'Sertifikasi',
  'TMT Kerja',
  'Tugas Tambahan',
  'Mengajar',
  'Jam Tugas Tambahan',
  'JJM',
  'Total JJM',
  'Siswa',
  'Kompetensi',
  'NIK',
  'Jabatan PTK'
];

export interface PTKRowData {
  nama: string;
  nuptk: string;
  jk: string;
  tempatLahir: string;
  tanggalLahir: string;
  nip: string;
  statusKepegawaian: string;
  jenisPtk: string;
  gelarDepan: string;
  gelarBelakang: string;
  jenjang: string;
  jurusanProdi: string;
  sertifikasi: string;
  tmtKerja: string;
  tugasTambahan: string;
  mengajar: string;
  jamTugasTambahan: string;
  jjm: string;
  totalJjm: string;
  siswa: string;
  kompetensi: string;
  nik: string;
  jabatanPtk: string;
}

interface TugasTambahanImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGtkList: GTKData[];
  onApplyImport: (
    finalList: GTKData[], 
    mode: 'merge' | 'replace', 
    stats: { matchingCount: number; newCount: number; retainedCount: number; finalTotal: number },
    rawPtkRows?: PTKRowData[]
  ) => Promise<void> | void;
}

export const TugasTambahanImportModal: React.FC<TugasTambahanImportModalProps> = ({
  isOpen,
  onClose,
  currentGtkList,
  onApplyImport
}) => {
  const [importedRows, setImportedRows] = useState<PTKRowData[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cleanStr = (val: any) => String(val || '').trim().toLowerCase();
  const cleanId = (val: any) => String(val || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  // Helper pembersih gelar nama untuk pencocokan
  const cleanPersonName = (n: string) =>
    (n || '')
      .toLowerCase()
      .replace(/,\s*(s\.?pd|s\.?kom|m\.?pd|s\.?e|s\.?t|s\.?ag|m\.?si|drs\.?|dr\.?|h\.?|hj\.?|gr\.?|s\.?sos|m\.?kom|m\.?ti)/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

  // Analisis statistik kecocokan data
  const stats = useMemo(() => {
    if (importedRows.length === 0) {
      return {
        matchingCount: 0,
        newCount: 0,
        retainedCount: currentGtkList.length,
        finalTotal: currentGtkList.length
      };
    }

    let matchingCount = 0;
    importedRows.forEach((row) => {
      const rowNip = cleanId(row.nip);
      const rowNuptk = cleanId(row.nuptk);
      const rowNik = cleanId(row.nik);
      const rowNamaClean = cleanPersonName(row.nama);

      const isMatch = currentGtkList.some((g) => {
        const gNip = cleanId(g.nip);
        const gNuptk = cleanId(g.nuptk);
        const gNik = cleanId(g.nik);
        const gNamaClean = cleanPersonName(g.nama);

        return (rowNip && gNip && rowNip === gNip) ||
               (rowNuptk && gNuptk && rowNuptk === gNuptk) ||
               (rowNik && gNik && rowNik === gNik) ||
               (rowNamaClean && gNamaClean && rowNamaClean === gNamaClean);
      });

      if (isMatch) matchingCount++;
    });

    const newCount = importedRows.length - matchingCount;
    const retainedCount = Math.max(0, currentGtkList.length - matchingCount);
    const finalTotal = importMode === 'replace' ? importedRows.length : (currentGtkList.length + newCount);

    return {
      matchingCount,
      newCount,
      retainedCount,
      finalTotal
    };
  }, [importedRows, currentGtkList, importMode]);

  if (!isOpen) return null;

  // Unduh Template Excel PTK (23 Header)
  const handleDownloadTemplate = () => {
    const sampleRows = [
      [
        'Drs. H. Ahmad Fauzi, M.Pd.',
        '1234567890123456',
        'L',
        'Palopo',
        '15/04/1975',
        '197504152000031002',
        'PNS',
        'Kepala Sekolah',
        'Drs. H.',
        'M.Pd.',
        'S2',
        'Manajemen Pendidikan',
        'Sudah',
        '01/03/2000',
        'Kepala Sekolah',
        'Tidak',
        '24',
        '0',
        '24',
        '0',
        'Manajerial',
        '7373011504750001',
        'Kepala Sekolah'
      ],
      [
        'Siti Rahmawati, S.Pd.',
        '9876543210987654',
        'P',
        'Luwu',
        '12/07/1982',
        '198207122008012015',
        'PNS',
        'Guru Mapel',
        '',
        'S.Pd.',
        'S1',
        'Pendidikan Matematika',
        'Sudah',
        '01/01/2008',
        'Wakil Kepala Sekolah Bidang Kurikulum',
        'Ya',
        '12',
        '18',
        '30',
        '180',
        'Matematika',
        '7373015207820002',
        'Guru Muda'
      ],
      [
        'Budi Santoso, S.Kom.',
        '4567890123456789',
        'L',
        'Makassar',
        '20/11/1985',
        '198511202010011012',
        'PNS',
        'Guru Kejuruan',
        '',
        'S.Kom.',
        'S1',
        'Teknik Informatika',
        'Sudah',
        '01/01/2010',
        'Kepala Program Keahlian RPL, Wali Kelas XI RPL 1',
        'Ya',
        '12',
        '16',
        '28',
        '140',
        'Rekayasa Perangkat Lunak',
        '7373012011850003',
        'Guru Muda'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([PTK_OFFICIAL_HEADERS, ...sampleRows]);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:W4');

    // Terapkan tipe teks ('@') pada semua sel
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cell_ref]) continue;
        ws[cell_ref].z = '@';
        ws[cell_ref].t = 's';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ptk');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Template_Smart_Impor_PTK_Tugas_Tambahan_${today}.xlsx`);
  };

  // Baca file Excel
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: 'array', cellText: true, raw: false });
        const sheetName = workbook.SheetNames.find(n => {
          const s = n.toLowerCase();
          return s.includes('ptk') || s.includes('tugas') || s.includes('tambahan') || s.includes('gtk');
        }) || workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error('Sheet data PTK tidak ditemukan dalam berkas Excel.');
        }

        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
        if (rawData.length < 2) {
          throw new Error('File Excel tidak memuat baris data yang cukup.');
        }

        const headerRow = rawData[0].map((h: any) => String(h || '').trim());
        const headerMap: Record<string, number> = {};
        headerRow.forEach((colName, idx) => {
          const cleanCol = colName.toLowerCase().replace(/[^a-z0-9]/g, '');
          headerMap[cleanCol] = idx;
        });

        const getColVal = (row: any[], ...aliases: string[]) => {
          for (const alias of aliases) {
            const clean = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (headerMap[clean] !== undefined) {
              const val = row[headerMap[clean]];
              if (val !== undefined && val !== null) return String(val).trim();
            }
          }
          return '';
        };

        const parsedList: PTKRowData[] = [];

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.every((c: any) => String(c || '').trim() === '')) continue;

          const nama = getColVal(row, 'Nama', 'Nama PTK', 'Nama Lengkap');
          const nuptk = getColVal(row, 'NUPTK', 'No NUPTK');
          const jk = getColVal(row, 'JK', 'Jenis Kelamin');
          const tempatLahir = getColVal(row, 'Tempat Lahir', 'TempatLahir');
          const tanggalLahir = formatToDDMMYYYY(getColVal(row, 'Tanggal Lahir', 'TanggalLahir', 'Tgl Lahir'));
          const nip = getColVal(row, 'NIP', 'Nomor Induk Pegawai');
          const statusKepegawaian = getColVal(row, 'Status Kepegawaian', 'StatusKepegawaian', 'Status');
          const jenisPtk = getColVal(row, 'Jenis PTK', 'JenisPTK', 'Jenis');
          const gelarDepan = getColVal(row, 'Gelar Depan', 'GelarDepan');
          const gelarBelakang = getColVal(row, 'Gelar Belakang', 'GelarBelakang');
          const jenjang = getColVal(row, 'Jenjang', 'Pendidikan');
          const jurusanProdi = getColVal(row, 'Jurusan/Prodi', 'Jurusan', 'Prodi', 'Program Studi');
          const sertifikasi = getColVal(row, 'Sertifikasi');
          const tmtKerja = formatToDDMMYYYY(getColVal(row, 'TMT Kerja', 'TMTKerja', 'TMT'));
          const tugasTambahan = getColVal(row, 'Tugas Tambahan', 'TugasTambahan', 'Tugas', 'Jabatan');
          const mengajar = getColVal(row, 'Mengajar');
          const jamTugasTambahan = getColVal(row, 'Jam Tugas Tambahan', 'JamTugasTambahan', 'Jam', 'JJM Tugas');
          const jjm = getColVal(row, 'JJM', 'Jam Mengajar');
          const totalJjm = getColVal(row, 'Total JJM', 'TotalJJM');
          const siswa = getColVal(row, 'Siswa', 'Jumlah Siswa');
          const kompetensi = getColVal(row, 'Kompetensi', 'Keahlian');
          const nik = getColVal(row, 'NIK', 'Nomor Induk Kependudukan');
          const jabatanPtk = getColVal(row, 'Jabatan PTK', 'JabatanPTK', 'Jabatan');

          if (!nama && !nip && !nuptk) continue;

          parsedList.push({
            nama: nama || '-',
            nuptk: nuptk || '',
            jk: jk || 'L',
            tempatLahir: tempatLahir || '',
            tanggalLahir: tanggalLahir || '',
            nip: nip || '',
            statusKepegawaian: statusKepegawaian || '',
            jenisPtk: jenisPtk || '',
            gelarDepan: gelarDepan || '',
            gelarBelakang: gelarBelakang || '',
            jenjang: jenjang || '',
            jurusanProdi: jurusanProdi || '',
            sertifikasi: sertifikasi || '',
            tmtKerja: tmtKerja || '',
            tugasTambahan: tugasTambahan || '-',
            mengajar: mengajar || '',
            jamTugasTambahan: jamTugasTambahan || '',
            jjm: jjm || '',
            totalJjm: totalJjm || '',
            siswa: siswa || '',
            kompetensi: kompetensi || '',
            nik: nik || '',
            jabatanPtk: jabatanPtk || ''
          });
        }

        if (parsedList.length === 0) {
          throw new Error('Tidak ada baris data PTK yang valid ditemukan dalam file Excel.');
        }

        setImportedRows(parsedList);
      } catch (err: any) {
        console.error('Error membaca excel PTK:', err);
        setErrorMessage(err.message || 'Gagal memproses file Excel.');
        setImportedRows([]);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Simpan hasil impor (memperbarui tugas tambahan pada daftar GTK dan sheet ptk)
  const handleConfirmImport = async () => {
    if (importedRows.length === 0) return;
    setIsProcessing(true);

    try {
      if (importMode === 'replace') {
        const replaceGtkList: GTKData[] = importedRows.map((row, idx) => ({
          id: row.nip && row.nip !== '-' ? row.nip : (row.nuptk && row.nuptk !== '-' ? row.nuptk : `PTK-${idx + 1}`),
          no: idx + 1,
          nama: row.nama,
          nuptk: row.nuptk,
          jk: row.jk,
          tempatLahir: row.tempatLahir,
          tanggalLahir: row.tanggalLahir,
          nip: row.nip,
          statusKepegawaian: row.statusKepegawaian,
          jenisPtk: row.jenisPtk,
          gelarDepan: row.gelarDepan,
          gelarBelakang: row.gelarBelakang,
          jenjang: row.jenjang,
          jurusanProdi: row.jurusanProdi,
          sertifikasi: row.sertifikasi,
          tmtKerja: row.tmtKerja,
          tugasTambahan: row.tugasTambahan,
          mengajar: row.mengajar,
          jamTugasTambahan: row.jamTugasTambahan,
          jjm: row.jjm,
          totalJjm: row.totalJjm,
          siswa: row.siswa,
          kompetensi: row.kompetensi,
          nik: row.nik,
          jabatanPtk: row.jabatanPtk,
          jabatan_ptk: row.jabatanPtk
        }));

        await onApplyImport(replaceGtkList, 'replace', stats, importedRows);
      } else {
        // Smart Merge
        const matchedIndices = new Set<number>();
        const updatedGtkList = currentGtkList.map((gtk) => {
          const gtkNip = cleanId(gtk.nip);
          const gtkNuptk = cleanId(gtk.nuptk);
          const gtkNik = cleanId(gtk.nik);
          const gtkNama = cleanPersonName(gtk.nama);

          const matchIdx = importedRows.findIndex((item) => {
            const itemNip = cleanId(item.nip);
            const itemNuptk = cleanId(item.nuptk);
            const itemNik = cleanId(item.nik);
            const itemNama = cleanPersonName(item.nama);

            return (itemNip && gtkNip && itemNip === gtkNip) ||
                   (itemNuptk && gtkNuptk && itemNuptk === gtkNuptk) ||
                   (itemNik && gtkNik && itemNik === gtkNik) ||
                   (itemNama && gtkNama && itemNama === gtkNama);
          });

          if (matchIdx >= 0) {
            matchedIndices.add(matchIdx);
            const match = importedRows[matchIdx];
            return {
              ...gtk,
              nama: match.nama || gtk.nama,
              nuptk: match.nuptk || gtk.nuptk,
              nip: match.nip || gtk.nip,
              jk: match.jk || gtk.jk,
              tempatLahir: match.tempatLahir || gtk.tempatLahir,
              tanggalLahir: match.tanggalLahir || gtk.tanggalLahir,
              statusKepegawaian: match.statusKepegawaian || gtk.statusKepegawaian,
              jenisPtk: match.jenisPtk || gtk.jenisPtk,
              gelarDepan: match.gelarDepan || gtk.gelarDepan,
              gelarBelakang: match.gelarBelakang || gtk.gelarBelakang,
              jenjang: match.jenjang || gtk.jenjang,
              jurusanProdi: match.jurusanProdi || gtk.jurusanProdi,
              sertifikasi: match.sertifikasi || gtk.sertifikasi,
              tmtKerja: match.tmtKerja || gtk.tmtKerja,
              tugasTambahan: match.tugasTambahan || gtk.tugasTambahan,
              mengajar: match.mengajar || gtk.mengajar,
              jamTugasTambahan: match.jamTugasTambahan || gtk.jamTugasTambahan,
              jjm: match.jjm || gtk.jjm,
              totalJjm: match.totalJjm || gtk.totalJjm,
              siswa: match.siswa || gtk.siswa,
              kompetensi: match.kompetensi || gtk.kompetensi,
              nik: match.nik || gtk.nik,
              jabatanPtk: match.jabatanPtk || gtk.jabatanPtk,
              jabatan_ptk: match.jabatanPtk || gtk.jabatan_ptk
            };
          }

          return gtk;
        });

        // Tambahkan baris baru yang belum ada di GTK
        const newGtkEntries: GTKData[] = [];
        importedRows.forEach((row, idx) => {
          if (!matchedIndices.has(idx)) {
            newGtkEntries.push({
              id: row.nip && row.nip !== '-' ? row.nip : (row.nuptk && row.nuptk !== '-' ? row.nuptk : `PTK-NEW-${idx + 1}`),
              no: updatedGtkList.length + newGtkEntries.length + 1,
              nama: row.nama,
              nuptk: row.nuptk,
              jk: row.jk,
              tempatLahir: row.tempatLahir,
              tanggalLahir: row.tanggalLahir,
              nip: row.nip,
              statusKepegawaian: row.statusKepegawaian,
              jenisPtk: row.jenisPtk,
              gelarDepan: row.gelarDepan,
              gelarBelakang: row.gelarBelakang,
              jenjang: row.jenjang,
              jurusanProdi: row.jurusanProdi,
              sertifikasi: row.sertifikasi,
              tmtKerja: row.tmtKerja,
              tugasTambahan: row.tugasTambahan,
              mengajar: row.mengajar,
              jamTugasTambahan: row.jamTugasTambahan,
              jjm: row.jjm,
              totalJjm: row.totalJjm,
              siswa: row.siswa,
              kompetensi: row.kompetensi,
              nik: row.nik,
              jabatanPtk: row.jabatanPtk,
              jabatan_ptk: row.jabatanPtk
            });
          }
        });

        const finalList = [...updatedGtkList, ...newGtkEntries];
        await onApplyImport(finalList, 'merge', stats, importedRows);
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menerapkan impor PTK / tugas tambahan.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header Modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl text-white">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                Smart Impor PTK & Tugas Tambahan
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-purple-50">
                  Sheet: ptk
                </span>
              </h3>
              <p className="text-xs text-purple-100">
                Impor data PTK 23 kolom resmi dengan format teks murni (@) dan konversi tanggal dd/MM/yyyy
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Konten Modal */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Notifikasi Error jika ada */}
          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed font-medium">
                <span className="font-bold">Terjadi Kesalahan: </span>
                {errorMessage}
              </div>
            </div>
          )}

          {/* Banner Informasi 23 Header */}
          <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-xl text-purple-700">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider">
                  23 Header Kolom Resmi Sheet ptk
                </h4>
                <p className="text-xs text-purple-700 mt-0.5">
                  Nama, NUPTK, JK, Tempat/Tgl Lahir, NIP, Status Kepegawaian, Jenis PTK, Gelar, Jenjang, Prodi, Sertifikasi, TMT Kerja, Tugas Tambahan, Mengajar, Jam Tugas Tambahan, JJM, Siswa, NIK, Jabatan PTK.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-purple-700 bg-white border border-purple-200 hover:bg-purple-100/50 transition-all shadow-xs shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4 text-purple-600" />
              <span>Unduh Template PTK (.xlsx)</span>
            </button>
          </div>

          {/* Area Drag & Drop / Pilih File */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              importedRows.length > 0 
                ? 'border-emerald-300 bg-emerald-50/40' 
                : 'border-slate-300 hover:border-purple-400 bg-slate-50/60 hover:bg-purple-50/30'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".xlsx,.xls" 
              className="hidden" 
            />
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                importedRows.length > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-purple-100 text-purple-600'
              }`}>
                {importedRows.length > 0 ? <FileSpreadsheet className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {importFileName ? (
                  <span className="text-emerald-700 font-bold">{importFileName}</span>
                ) : (
                  <span>Klik atau seret berkas Excel sheet ptk ke sini</span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Mendukung format .xlsx dan .xls (semua cell otomatis terbaca sebagai Plain Text)
              </p>
            </div>
          </div>

          {/* Opsi Mode Impor */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Pilihan Mode Impor:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label 
                className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  importMode === 'merge' 
                    ? 'border-purple-500 bg-purple-50/50 ring-1 ring-purple-500' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input 
                  type="radio" 
                  name="importMode" 
                  value="merge" 
                  checked={importMode === 'merge'} 
                  onChange={() => setImportMode('merge')} 
                  className="mt-1 text-purple-600 focus:ring-purple-500 cursor-pointer" 
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Smart Merge (Direkomendasikan)</span>
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold">
                      Aman
                    </span>
                  </div>
                  <p className="text-slate-500 mt-1">
                    Hanya memperbarui rincian tugas tambahan dan data PTK yang cocok (NIP/NUPTK/NIK/Nama), serta menambahkan guru baru tanpa menghapus data lain.
                  </p>
                </div>
              </label>

              <label 
                className={`p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  importMode === 'replace' 
                    ? 'border-rose-500 bg-rose-50/50 ring-1 ring-rose-500' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input 
                  type="radio" 
                  name="importMode" 
                  value="replace" 
                  checked={importMode === 'replace'} 
                  onChange={() => setImportMode('replace')} 
                  className="mt-1 text-rose-600 focus:ring-rose-500 cursor-pointer" 
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Ganti Semua (Replace All)</span>
                    <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-semibold">
                      Timpa
                    </span>
                  </div>
                  <p className="text-slate-500 mt-1">
                    Menghapus seluruh daftar PTK yang ada dan menggantikannya penuh dengan baris dari file Excel ini.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Ringkasan Analisis Statistik */}
          {importedRows.length > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-indigo-600" />
                  <span>Hasil Analisis Data Berkas:</span>
                </span>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                  Total {importedRows.length} Baris Terdeteksi
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[11px] text-slate-500">Total di File</div>
                  <div className="text-base font-bold text-slate-800">{importedRows.length}</div>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[11px] text-emerald-600 font-semibold">Data Cocok (Update)</div>
                  <div className="text-base font-bold text-emerald-700">{stats.matchingCount}</div>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[11px] text-amber-600 font-semibold">Data Baru</div>
                  <div className="text-base font-bold text-amber-700">{stats.newCount}</div>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[11px] text-indigo-600 font-semibold">Estimasi Akhir</div>
                  <div className="text-base font-bold text-indigo-700">{stats.finalTotal}</div>
                </div>
              </div>
            </div>
          )}

          {/* Pratinjau Tabel (10 Baris Pertama) */}
          {importedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-purple-600" />
                  <span>Pratinjau Data (Maksimal 10 Baris Pertama):</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  Menampilkan {Math.min(10, importedRows.length)} dari {importedRows.length} baris
                </span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-60 shadow-2xs">
                <table className="w-full text-[11px] text-left border-collapse whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold border-b border-slate-200 z-10">
                    <tr>
                      <th className="py-2.5 px-3">No</th>
                      <th className="py-2.5 px-3">Nama</th>
                      <th className="py-2.5 px-3">NIP</th>
                      <th className="py-2.5 px-3">NUPTK</th>
                      <th className="py-2.5 px-3">Tugas Tambahan</th>
                      <th className="py-2.5 px-3">Jam Tugas</th>
                      <th className="py-2.5 px-3">Jabatan PTK</th>
                      <th className="py-2.5 px-3">Status Pegawai</th>
                      <th className="py-2.5 px-3">Jenis PTK</th>
                      <th className="py-2.5 px-3">Jenjang</th>
                      <th className="py-2.5 px-3">Prodi</th>
                      <th className="py-2.5 px-3">TMT Kerja</th>
                      <th className="py-2.5 px-3">JJM</th>
                      <th className="py-2.5 px-3">NIK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importedRows.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="hover:bg-purple-50/30 transition-colors">
                        <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{row.nama}</td>
                        <td className="py-2 px-3 font-mono text-slate-700">{row.nip || '-'}</td>
                        <td className="py-2 px-3 font-mono text-slate-700">{row.nuptk || '-'}</td>
                        <td className="py-2 px-3 font-medium text-purple-700">{row.tugasTambahan || '-'}</td>
                        <td className="py-2 px-3 text-center">{row.jamTugasTambahan || '0'}</td>
                        <td className="py-2 px-3">{row.jabatanPtk || '-'}</td>
                        <td className="py-2 px-3">{row.statusKepegawaian || '-'}</td>
                        <td className="py-2 px-3">{row.jenisPtk || '-'}</td>
                        <td className="py-2 px-3">{row.jenjang || '-'}</td>
                        <td className="py-2 px-3">{row.jurusanProdi || '-'}</td>
                        <td className="py-2 px-3">{row.tmtKerja || '-'}</td>
                        <td className="py-2 px-3 text-center">{row.jjm || '0'}</td>
                        <td className="py-2 px-3 font-mono">{row.nik || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Aksi Modal */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 border border-slate-300 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importedRows.length === 0 || isProcessing}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all flex items-center gap-2 cursor-pointer ${
                importedRows.length === 0 || isProcessing
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 active:scale-98'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memproses Impor...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Terapkan Impor ({importedRows.length} Data)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
