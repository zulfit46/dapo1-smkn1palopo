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
  Sparkles, 
  UserCheck, 
  UserPlus, 
  Info, 
  ShieldCheck, 
  Eye
} from 'lucide-react';

export const GTK_BIODATA_OFFICIAL_HEADERS = [
  'Nama', 'NUPTK', 'JK', 'Tempat Lahir', 'Tanggal Lahir', 'NIP', 'Status Kepegawaian',
  'Jenis PTK', 'Agama', 'Alamat Jalan', 'RT', 'RW', 'Nama Dusun', 'Desa/Kelurahan',
  'Kecamatan', 'Kode Pos', 'Telepon', 'HP', 'Email', 'Tugas Tambahan', 'SK CPNS',
  'Tanggal CPNS', 'SK Pengangkatan', 'TMT Pengangkatan', 'Lembaga Pengangkatan',
  'Pangkat Golongan', 'Sumber Gaji', 'Nama Ibu Kandung', 'Status Perkawinan',
  'Nama Suami/Istri', 'NIP Suami/Istri', 'Pekerjaan Suami/Istri', 'TMT PNS',
  'Sudah Lisensi Kepala Sekolah', 'Pernah Diklat Kepengawasan', 'Keahlian Braille',
  'Keahlian Bahasa Isyarat', 'NPWP', 'Nama Wajib Pajak', 'Kewarganegaraan', 'Bank',
  'Nomor Rekening Bank', 'Rekening Atas Nama', 'NIK', 'No KK', 'Karpeg', 'Karis/Karsu',
  'Lintang', 'Bujur', 'NUKS', 'status_login', 'akses_menu'
];

interface GTKBiodataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGtkList: GTKData[];
  onApplyImport: (
    finalList: GTKData[], 
    mode: 'merge' | 'replace', 
    stats: { matchingCount: number; newCount: number; retainedCount: number; finalTotal: number }
  ) => Promise<void> | void;
}

export const GTKBiodataImportModal: React.FC<GTKBiodataImportModalProps> = ({
  isOpen,
  onClose,
  currentGtkList,
  onApplyImport
}) => {
  const [importedRows, setImportedRows] = useState<GTKData[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge'); // Default: Smart Merge
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Normalisasi string pembanding
  const cleanStr = (val: any) => String(val || '').trim().toLowerCase();
  const cleanId = (val: any) => String(val || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  // Analisis statistik pencocokan data
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
      const rowNama = cleanStr(row.nama);

      const isMatch = currentGtkList.some((g) => {
        const gNip = cleanId(g.nip);
        const gNuptk = cleanId(g.nuptk);
        const gNama = cleanStr(g.nama);
        return (rowNip && gNip && rowNip === gNip) ||
               (rowNuptk && gNuptk && rowNuptk === gNuptk) ||
               (rowNama && gNama && rowNama === gNama);
      });

      if (isMatch) matchingCount++;
    });

    const newCount = importedRows.length - matchingCount;
    const retainedCount = Math.max(0, currentGtkList.length - matchingCount);
    const finalTotal = importMode === 'merge' ? currentGtkList.length + newCount : importedRows.length;

    return {
      matchingCount,
      newCount,
      retainedCount,
      finalTotal
    };
  }, [importedRows, currentGtkList, importMode]);

  if (!isOpen) return null;

  // Unduh Template Excel Resmi dengan 53 Header & Format Teks Murni (@)
  const handleDownloadTemplate = () => {
    const sampleRows = [
      [
        'Drs. H. Ahmad Fauzi, M.Pd.', '1234567890123456', 'L', 'Palopo', '15/04/1975',
        '197504152000031002', 'PNS', 'Guru Mapel', 'Islam', 'Jl. Merdeka No. 45',
        '01', '02', 'Dusun Harapan', 'Boting', 'Wara', '91921', '047123456', '081234567890',
        'ahmad.fauzi@sekolah.sch.id', 'Wali Kelas X RPL 1', '813/CPNS/2000', '01/03/2000',
        '813/PNS/2001', '01/12/2001', 'Pemerintah Provinsi', 'Pembina Tk. I, IV/b', 'APBD Provinsi',
        'Siti Rahmah', 'Kawin', 'Dra. Nurhayati', '197808202005022001', 'PNS Daerah', '01/12/2001',
        'Sudah', 'Pernah', 'Tidak', 'Tidak', '12.345.678.9-801.000', 'Ahmad Fauzi', 'Indonesia',
        'Bank Sulselbar', '01234567890', 'Ahmad Fauzi', '7373011504750001', '7373011504000002',
        'F123456', 'K123456', '-2.981234', '120.198765', '197504152000031002', 'user', 'dashboard,gtk,pembelajaran'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([GTK_BIODATA_OFFICIAL_HEADERS, ...sampleRows]);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:BA2');

    // Tetapkan semua cell sebagai Text format (@) untuk melindungi awalan 0
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cell_ref]) continue;
        ws[cell_ref].z = '@';
        ws[cell_ref].t = 's';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'gtk');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Template_Smart_Impor_GTK_53_Kolom_${today}.xlsx`);
  };

  // Baca file Excel dengan format cell text murni
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
          return s.includes('gtk') || s.includes('guru') || s.includes('ptk') || s.includes('data');
        }) || workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error('Sheet data GTK tidak ditemukan dalam berkas Excel.');
        }

        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
        if (rawData.length < 2) {
          throw new Error('File Excel tidak memuat baris data yang cukup (minimal baris header dan 1 baris data).');
        }

        // Pemetaan Header
        const headerRow = rawData[0].map((h: any) => String(h || '').trim());
        const headerMap: Record<string, number> = {};
        headerRow.forEach((colName, idx) => {
          const cleanCol = colName.toLowerCase().replace(/[^a-z0-9]/g, '');
          headerMap[cleanCol] = idx;
        });

        // Helper pembaca kolom
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

        const parsedList: GTKData[] = [];

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.every((c: any) => String(c || '').trim() === '')) continue;

          const nama = getColVal(row, 'Nama', 'Nama Lengkap', 'Nama PTK', 'Nama Guru');
          const nip = getColVal(row, 'NIP', 'Nomor Induk Pegawai', 'NIP Baru');
          const nuptk = getColVal(row, 'NUPTK', 'No NUPTK');
          const jk = getColVal(row, 'JK', 'Jenis Kelamin', 'L/P') || 'L';

          if (!nama && !nip && !nuptk) continue;

          const gtkItem: GTKData = {
            id: nip || nuptk || `GTK-${Date.now()}-${i}`,
            no: i,
            nama: nama || '-',
            nuptk: nuptk || '',
            jk: jk.toUpperCase().startsWith('P') ? 'P' : 'L',
            tempatLahir: getColVal(row, 'Tempat Lahir', 'TempatLahir', 't_lahir'),
            tanggalLahir: getColVal(row, 'Tanggal Lahir', 'TanggalLahir', 'tgl_lahir'),
            nip: nip || '',
            statusKepegawaian: getColVal(row, 'Status Kepegawaian', 'StatusKepegawaian', 'Status'),
            jenisPtk: getColVal(row, 'Jenis PTK', 'JenisPTK', 'Jenis'),
            agama: getColVal(row, 'Agama'),
            alamatJalan: getColVal(row, 'Alamat Jalan', 'Alamat', 'AlamatJalan'),
            rt: getColVal(row, 'RT'),
            rw: getColVal(row, 'RW'),
            namaDusun: getColVal(row, 'Nama Dusun', 'Dusun', 'NamaDusun'),
            desaKelurahan: getColVal(row, 'Desa/Kelurahan', 'Desa', 'Kelurahan', 'DesaKelurahan'),
            kecamatan: getColVal(row, 'Kecamatan'),
            kodePos: getColVal(row, 'Kode Pos', 'KodePos'),
            telepon: getColVal(row, 'Telepon', 'Telp'),
            hp: getColVal(row, 'HP', 'No HP', 'Handphone', 'NoHP'),
            email: getColVal(row, 'Email', 'Surel'),
            tugasTambahan: getColVal(row, 'Tugas Tambahan', 'TugasTambahan'),
            skCpns: getColVal(row, 'SK CPNS', 'SKCPNS'),
            tanggalCpns: getColVal(row, 'Tanggal CPNS', 'TanggalCPNS', 'Tgl CPNS'),
            skPengangkatan: getColVal(row, 'SK Pengangkatan', 'SKPengangkatan'),
            tmtPengangkatan: getColVal(row, 'TMT Pengangkatan', 'TMTPengangkatan', 'TMT'),
            lembagaPengangkatan: getColVal(row, 'Lembaga Pengangkatan', 'LembagaPengangkatan'),
            pangkatGolongan: getColVal(row, 'Pangkat Golongan', 'PangkatGolongan', 'Golongan', 'Gol'),
            sumberGaji: getColVal(row, 'Sumber Gaji', 'SumberGaji'),
            namaIbuKandung: getColVal(row, 'Nama Ibu Kandung', 'NamaIbuKandung', 'Ibu Kandung'),
            statusPerkawinan: getColVal(row, 'Status Perkawinan', 'StatusPerkawinan'),
            namaSuamiIstri: getColVal(row, 'Nama Suami/Istri', 'Nama Suami Istri', 'Nama Pasangan'),
            nipSuamiIstri: getColVal(row, 'NIP Suami/Istri', 'NIP Suami Istri'),
            pekerjaanSuamiIstri: getColVal(row, 'Pekerjaan Suami/Istri', 'Pekerjaan Suami Istri'),
            tmtPns: getColVal(row, 'TMT PNS', 'TMTPNS'),
            sudahLisensiKepalaSekolah: getColVal(row, 'Sudah Lisensi Kepala Sekolah', 'Lisensi KS'),
            pernahDiklatKepengawasan: getColVal(row, 'Pernah Diklat Kepengawasan', 'Diklat Kepengawasan'),
            keahlianBraille: getColVal(row, 'Keahlian Braille', 'Braille'),
            keahlianBahasaIsyarat: getColVal(row, 'Keahlian Bahasa Isyarat', 'Bahasa Isyarat'),
            npwp: getColVal(row, 'NPWP'),
            namaWajibPajak: getColVal(row, 'Nama Wajib Pajak', 'NamaWajibPajak'),
            kewarganegaraan: getColVal(row, 'Kewarganegaraan') || 'Indonesia',
            bank: getColVal(row, 'Bank', 'Nama Bank'),
            nomorRekeningBank: getColVal(row, 'Nomor Rekening Bank', 'No Rekening', 'NomorRekeningBank', 'Rekening'),
            rekeningAtasNama: getColVal(row, 'Rekening Atas Nama', 'RekeningAtasNama', 'Nama Rekening'),
            nik: getColVal(row, 'NIK', 'No KTP'),
            noKk: getColVal(row, 'No KK', 'Nomor KK', 'NoKK'),
            karpeg: getColVal(row, 'Karpeg', 'No Karpeg'),
            karisKarsu: getColVal(row, 'Karis/Karsu', 'KarisKarsu'),
            lintang: getColVal(row, 'Lintang', 'Latitude'),
            bujur: getColVal(row, 'Bujur', 'Longitude'),
            nuks: getColVal(row, 'NUKS'),
            status_login: getColVal(row, 'status_login', 'Status Login', 'Role') || 'user',
            akses_menu: getColVal(row, 'akses_menu', 'Akses Menu', 'Hak Akses') || 'dashboard,gtk,pembelajaran'
          };

          parsedList.push(gtkItem);
        }

        if (parsedList.length === 0) {
          throw new Error('Tidak ada baris data GTK yang valid ditemukan dalam berkas Excel.');
        }

        setImportedRows(parsedList);
      } catch (err: any) {
        console.error('Error membaca excel GTK:', err);
        setErrorMessage(err.message || 'Gagal memproses file Excel.');
        setImportedRows([]);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Proses Simpan / Terapkan Impor
  const handleConfirmImport = async () => {
    if (importedRows.length === 0) return;
    setIsProcessing(true);

    try {
      let finalList: GTKData[] = [];

      if (importMode === 'replace') {
        finalList = importedRows.map((item, idx) => ({
          ...item,
          no: idx + 1
        }));
      } else {
        // Smart Merge: Cocokkan berdasarkan NIP / NUPTK / Nama
        const map = new Map<string, GTKData>();

        currentGtkList.forEach((existing) => {
          const key = cleanId(existing.nip) || cleanId(existing.nuptk) || cleanStr(existing.nama);
          if (key) map.set(key, { ...existing });
        });

        importedRows.forEach((incoming) => {
          const key = cleanId(incoming.nip) || cleanId(incoming.nuptk) || cleanStr(incoming.nama);
          if (key && map.has(key)) {
            const prev = map.get(key)!;
            // Merge cerdas: pertahankan field yang tidak kosong dari incoming
            const merged: GTKData = { ...prev, ...incoming };
            Object.keys(incoming).forEach((k) => {
              if ((incoming as any)[k] !== '' && (incoming as any)[k] !== undefined) {
                (merged as any)[k] = (incoming as any)[k];
              }
            });
            map.set(key, merged);
          } else if (key) {
            map.set(key, incoming);
          }
        });

        finalList = Array.from(map.values()).map((item, idx) => ({
          ...item,
          no: idx + 1
        }));
      }

      await onApplyImport(finalList, importMode, stats);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menerapkan impor data GTK.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header Modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl text-white">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                Smart Impor Biodata GTK
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-emerald-50">
                  53 Header Resmi
                </span>
              </h3>
              <p className="text-xs text-emerald-100">
                Pembaruan cerdas data Guru dan Tenaga Kependidikan dengan proteksi teks murni (@)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Konten Modal */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-slate-800">

          {/* Alert / Pesan Error */}
          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Terjadi Kesalahan</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Bagian Unduh Template & Unggah File */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box 1: Template Excel */}
            <div className="border border-slate-200 bg-slate-50/70 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 text-slate-800 font-semibold mb-1">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <h4>1. Unduh Template Excel</h4>
                </div>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  Gunakan format resmi dengan 53 kolom berformat teks murni (<span className="font-mono font-bold">@</span>) agar awalan angka 0 pada NIP, NUPTK, NIK, dan No. Rekening tidak terhapus.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="w-full inline-flex items-center justify-center space-x-2 py-2 px-3 bg-white border border-emerald-500 text-emerald-700 font-medium rounded-lg hover:bg-emerald-50 transition-colors shadow-sm text-xs"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Template GTK (53 Kolom)</span>
              </button>
            </div>

            {/* Box 2: Unggah File Excel */}
            <div className="border border-dashed border-emerald-300 bg-emerald-50/30 p-4 rounded-xl flex flex-col justify-between items-center text-center">
              <div>
                <div className="flex items-center justify-center space-x-2 text-slate-800 font-semibold mb-1">
                  <Upload className="w-5 h-5 text-emerald-600" />
                  <h4>2. Pilih File Excel</h4>
                </div>
                <p className="text-xs text-slate-500 mb-2">
                  Format berkas yang didukung: <span className="font-semibold text-slate-700">.xlsx / .xls</span>
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
                id="file-gtk-import"
              />

              <label
                htmlFor="file-gtk-import"
                className="cursor-pointer inline-flex items-center space-x-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-sm text-xs"
              >
                <Upload className="w-4 h-4" />
                <span>{importFileName ? 'Ganti File Excel' : 'Pilih Berkas Excel'}</span>
              </label>

              {importFileName && (
                <span className="text-xs text-emerald-700 font-medium mt-1 truncate max-w-full">
                  Terpilih: {importFileName}
                </span>
              )}
            </div>
          </div>

          {/* Opsi Mode Impor */}
          <div className="border border-slate-200 bg-white p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              Pilih Metode Impor
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label 
                className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  importMode === 'merge' 
                    ? 'border-emerald-500 bg-emerald-50/60 shadow-sm' 
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block flex items-center gap-1.5">
                    Smart Merge (Disarankan)
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-semibold">Aman</span>
                  </span>
                  <span className="text-[11px] text-slate-500 leading-normal block mt-0.5">
                    Memperbarui data jika NIP/NUPTK/Nama cocok, menambahkan baris baru, dan mempertahankan data GTK lain yang ada.
                  </span>
                </div>
              </label>

              <label 
                className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  importMode === 'replace' 
                    ? 'border-rose-500 bg-rose-50/50 shadow-sm' 
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="mt-0.5 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <span className="text-xs font-bold text-rose-900 block flex items-center gap-1.5">
                    Ganti Seluruh Data (Replace All)
                    <span className="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0.2 rounded font-semibold">Timpa</span>
                  </span>
                  <span className="text-[11px] text-slate-500 leading-normal block mt-0.5">
                    Menghapus seluruh daftar GTK saat ini dan menggantinya sepenuhnya hanya dengan baris yang diimpor dari file Excel ini.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Kartu Ringkasan Analisis */}
          {importedRows.length > 0 && (
            <div className="bg-gradient-to-br from-slate-50 to-emerald-50/40 border border-emerald-100 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-100/80 pb-2">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Hasil Analisis Data Excel ({importedRows.length} Baris Terbaca)
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded-full">
                  Siap Diterapkan
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-xs">
                  <span className="text-[11px] text-slate-500 block">Total di Excel</span>
                  <span className="text-lg font-bold text-slate-800">{importedRows.length}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200/80 shadow-xs">
                  <span className="text-[11px] text-emerald-600 font-medium block flex items-center justify-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    Data Diperbarui
                  </span>
                  <span className="text-lg font-bold text-emerald-700">{stats.matchingCount}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-blue-200/80 shadow-xs">
                  <span className="text-[11px] text-blue-600 font-medium block flex items-center justify-center gap-1">
                    <UserPlus className="w-3.5 h-3.5" />
                    Data Baru
                  </span>
                  <span className="text-lg font-bold text-blue-700">{stats.newCount}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-purple-200/80 shadow-xs">
                  <span className="text-[11px] text-purple-600 font-medium block">Total Akhir di Aplikasi</span>
                  <span className="text-lg font-bold text-purple-700">{stats.finalTotal}</span>
                </div>
              </div>
            </div>
          )}

          {/* Pratinjau Baris Data */}
          {importedRows.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  Pratinjau Data (Maksimal 10 Baris Pertama)
                </span>
                <span className="text-[11px] text-slate-500">
                  Menampilkan {Math.min(10, importedRows.length)} dari {importedRows.length} data
                </span>
              </div>
              <div className="overflow-x-auto max-h-56">
                <table className="w-full text-left text-xs text-slate-700 border-collapse">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 font-semibold">No</th>
                      <th className="py-2 px-3 font-semibold">Status Impor</th>
                      <th className="py-2 px-3 font-semibold">Nama Lengkap</th>
                      <th className="py-2 px-3 font-semibold">NIP</th>
                      <th className="py-2 px-3 font-semibold">NUPTK</th>
                      <th className="py-2 px-3 font-semibold">Jenis PTK</th>
                      <th className="py-2 px-3 font-semibold">Kepegawaian</th>
                      <th className="py-2 px-3 font-semibold">Tugas Tambahan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importedRows.slice(0, 10).map((row, idx) => {
                      const rowNip = cleanId(row.nip);
                      const rowNuptk = cleanId(row.nuptk);
                      const rowNama = cleanStr(row.nama);
                      const isMatch = currentGtkList.some((g) => {
                        const gNip = cleanId(g.nip);
                        const gNuptk = cleanId(g.nuptk);
                        const gNama = cleanStr(g.nama);
                        return (rowNip && gNip && rowNip === gNip) ||
                               (rowNuptk && gNuptk && rowNuptk === gNuptk) ||
                               (rowNama && gNama && rowNama === gNama);
                      });

                      return (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="py-2 px-3 text-slate-500 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3">
                            {isMatch ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                <UserCheck className="w-3 h-3" /> Pembaruan
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                                <UserPlus className="w-3 h-3" /> Baru
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900">{row.nama}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">{row.nip || '-'}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">{row.nuptk || '-'}</td>
                          <td className="py-2 px-3">{row.jenisPtk || '-'}</td>
                          <td className="py-2 px-3">{row.statusKepegawaian || '-'}</td>
                          <td className="py-2 px-3 text-slate-600">{row.tugasTambahan || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer Tombol Aksi */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info className="w-4 h-4 text-slate-400" />
            <span>Format tanggal otomatis disesuaikan ke standar dd/MM/yyyy</span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importedRows.length === 0 || isProcessing}
              className="inline-flex items-center space-x-2 px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all"
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
