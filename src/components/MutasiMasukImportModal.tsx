import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { MutasiMasukItem } from '../types';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  RefreshCw, 
  Layers,
  Sparkles
} from 'lucide-react';

export const MUTASI_MASUK_OFFICIAL_HEADERS = [
  'NISN',
  'Nama_Siswa',
  'Provinsi',
  'Kab_kota',
  'Kecamatan',
  'Nama_Sekolah',
  'Rombel_Tujuan',
  'Status',
  'Timestamp',
  'verval_oleh'
] as const;

interface MutasiMasukImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentList: MutasiMasukItem[];
  onApplyImport: (
    finalList: MutasiMasukItem[], 
    mode: 'merge' | 'replace', 
    stats: { matchingCount: number; newCount: number; retainedCount: number; finalTotal: number }
  ) => Promise<void> | void;
}

export const MutasiMasukImportModal: React.FC<MutasiMasukImportModalProps> = ({
  isOpen,
  onClose,
  currentList,
  onApplyImport
}) => {
  const [importedRows, setImportedRows] = useState<MutasiMasukItem[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge'); // Default: Smart Merge
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper untuk mencocokkan baris mutasi masuk berdasarkan NISN atau Nama
  const findMatchIndex = (list: MutasiMasukItem[], target: MutasiMasukItem) => {
    const tNisn = (target.nisn || '').trim();
    const tNama = (target.nama || '').trim().toLowerCase();

    return list.findIndex((m) => {
      const mNisn = (m.nisn || '').trim();
      const mNama = (m.nama || '').trim().toLowerCase();
      if (tNisn && mNisn && tNisn === mNisn) return true;
      if (tNama && mNama && tNama === mNama && tNama.length > 2) return true;
      return false;
    });
  };

  // Analisis statistik kecocokan data
  const stats = useMemo(() => {
    if (importedRows.length === 0) {
      return {
        matchingCount: 0,
        newCount: 0,
        retainedCount: currentList.length,
        finalTotal: currentList.length
      };
    }

    let matching = 0;
    importedRows.forEach((imp) => {
      if (findMatchIndex(currentList, imp) !== -1) matching++;
    });

    const newCount = importedRows.length - matching;
    const retainedCount = Math.max(0, currentList.length - matching);
    const finalTotal = importMode === 'merge' ? currentList.length + newCount : importedRows.length;

    return {
      matchingCount: matching,
      newCount,
      retainedCount,
      finalTotal
    };
  }, [importedRows, currentList, importMode]);

  if (!isOpen) return null;

  // Unduh Template Resmi Excel Mutasi Masuk (10 Header)
  const handleDownloadTemplate = () => {
    const headers = [...MUTASI_MASUK_OFFICIAL_HEADERS];
    const sampleRows = [
      [
        '0081234567',
        'Ahmad Fadhil Prasetya',
        'SULAWESI SELATAN',
        'KOTA PALOPO',
        'WARA',
        'SMP Negeri 1 Palopo',
        'X RPL 1',
        'Diterima',
        new Date().toISOString().replace('T', ' ').substring(0, 19),
        'Admin'
      ],
      [
        '0087654321',
        'Nurul Aini Putri',
        'SULAWESI SELATAN',
        'KABUPATEN LUWU',
        'BELOPA',
        'SMP Negeri 2 Belopa',
        'X TKJ 2',
        'Pending',
        new Date().toISOString().replace('T', ' ').substring(0, 19),
        'Admin'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    // Format semua sel sebagai teks murni (@)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:J3');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_address = { c: C, r: R };
        const cell_ref = XLSX.utils.encode_cell(cell_address);
        if (!ws[cell_ref]) continue;
        ws[cell_ref].z = '@';
        ws[cell_ref].t = 's';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'mutasi_masuk');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Template_Mutasi_Masuk_10_Kolom_${today}.xlsx`);
  };

  // Membaca file Excel yang diunggah
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
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('masuk')) || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
          throw new Error('Sheet data mutasi masuk tidak ditemukan dalam berkas Excel.');
        }

        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
        if (rawJson.length === 0) {
          throw new Error('Berkas Excel tidak memiliki baris data.');
        }

        const parsed: MutasiMasukItem[] = [];

        rawJson.forEach((row, idx) => {
          // Helper pencarian nilai kolom tanpa sensitif huruf/tanda baca
          const getVal = (...keys: string[]) => {
            for (const k of keys) {
              if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                return String(row[k]).trim();
              }
              const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
              for (const rowKey of Object.keys(row)) {
                if (rowKey.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanK) {
                  const val = row[rowKey];
                  if (val !== undefined && val !== null && String(val).trim() !== '') {
                    return String(val).trim();
                  }
                }
              }
            }
            return '';
          };

          const nisn = getVal('NISN', 'nisn');
          const nama = getVal('Nama_Siswa', 'Nama Siswa', 'Nama', 'nama_siswa', 'namasiswa');
          const provinsi = getVal('Provinsi', 'provinsi', 'Provinsi Asal');
          const kabKota = getVal('Kab_kota', 'Kab/Kota', 'Kabupaten/Kota', 'kab_kota', 'kabkota');
          const kecamatan = getVal('Kecamatan', 'kecamatan', 'Kecamatan Asal');
          const sekolahAsal = getVal('Nama_Sekolah', 'Nama Sekolah', 'Sekolah Asal', 'sekolah_asal', 'namasekolah');
          const rombelTujuan = getVal('Rombel_Tujuan', 'Rombel Tujuan', 'Rombel', 'rombel_tujuan', 'rombeltujuan');
          const rawStatus = getVal('Status', 'status');
          const status: 'Pending' | 'Diterima' = rawStatus.toLowerCase() === 'diterima' ? 'Diterima' : 'Pending';
          const timestamp = getVal('Timestamp', 'timestamp', 'Waktu', 'tgl_masuk', 'tanggal_masuk') || 
            new Date().toISOString().replace('T', ' ').substring(0, 19);
          const vervalOleh = getVal('verval_oleh', 'Verval Oleh', 'vervaloleh', 'petugas');

          if (nama || nisn) {
            parsed.push({
              id: `MUT-IN-${nisn || Date.now()}-${idx + 1}`,
              no: idx + 1,
              nisn,
              nama,
              provinsiNama: provinsi,
              kabKotaNama: kabKota,
              kecamatanNama: kecamatan,
              sekolahAsal,
              rombelTujuan,
              status,
              timestamp,
              tglMasuk: timestamp.split(' ')[0],
              verval_oleh: vervalOleh,
              vervalOleh: vervalOleh
            });
          }
        });

        if (parsed.length === 0) {
          throw new Error('Tidak ditemukan baris data mutasi masuk yang valid. Pastikan header sesuai (NISN, Nama_Siswa, dll).');
        }

        setImportedRows(parsed);
      } catch (err: any) {
        setErrorMessage(err?.message || 'Gagal memproses berkas Excel.');
        setImportedRows([]);
      }
    };

    reader.onerror = () => {
      setErrorMessage('Gagal membaca file dari penyimpanan.');
      setImportedRows([]);
    };

    reader.readAsArrayBuffer(file);
  };

  const handleApply = async () => {
    if (importedRows.length === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      let finalList: MutasiMasukItem[] = [];

      if (importMode === 'merge') {
        const merged = [...currentList];
        importedRows.forEach((imp, i) => {
          const matchIdx = findMatchIndex(merged, imp);
          if (matchIdx !== -1) {
            const prev = merged[matchIdx];
            merged[matchIdx] = {
              ...prev,
              ...imp,
              id: prev.id,
              no: prev.no || matchIdx + 1,
              status: imp.status || prev.status || 'Pending',
              verval_oleh: imp.verval_oleh || prev.verval_oleh || ''
            };
          } else {
            merged.push({
              ...imp,
              id: imp.id || `MUT-IN-${Date.now()}-${i + 1}`,
              no: merged.length + 1
            });
          }
        });
        finalList = merged;
      } else {
        finalList = importedRows.map((r, idx) => ({ ...r, no: idx + 1 }));
      }

      await onApplyImport(finalList, importMode, stats);

      setTimeout(() => {
        setIsProcessing(false);
        setImportedRows([]);
        setImportFileName('');
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal menyimpan hasil impor mutasi masuk.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200 shadow-2xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">
                  Smart Impor Mutasi Masuk (Excel)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                  10 Kolom Resmi
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Mendukung fitur Smart Merge (Aman dari penghapusan data lama)
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (!isProcessing) {
                setImportedRows([]);
                setImportFileName('');
                setErrorMessage(null);
                onClose();
              }
            }}
            disabled={isProcessing}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Banner Petunjuk & Download Template */}
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
              <div className="text-xs text-indigo-950">
                <p className="font-semibold text-slate-800">
                  10 Kolom Format Resmi Mutasi Masuk:
                </p>
                <p className="text-slate-600 mt-0.5 text-[11px] leading-relaxed font-mono">
                  NISN, Nama_Siswa, Provinsi, Kab_kota, Kecamatan, Nama_Sekolah, Rombel_Tujuan, Status, Timestamp, verval_oleh
                </p>
              </div>
            </div>
            <button
              onClick={handleDownloadTemplate}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-indigo-700 font-semibold text-xs rounded-xl border border-indigo-300 shadow-2xs transition-colors shrink-0 cursor-pointer"
              title="Unduh format template Excel Mutasi Masuk"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Template (10 Kolom)</span>
            </button>
          </div>

          {/* Upload Dropzone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {!importFileName ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50 hover:bg-indigo-50/30 rounded-2xl p-7 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
              >
                <div className="p-3 bg-white group-hover:bg-indigo-100 rounded-full border border-slate-200 text-indigo-600 mb-2.5 shadow-2xs transition-colors">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-800">
                  Pilih Berkas Excel Mutasi Masuk (.xlsx / .xls)
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Format akan otomatis diselaraskan dengan 10 kolom Mutasi Masuk
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
                      ✓ {importedRows.length} data mutasi masuk berhasil dibaca
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImportedRows([]);
                    setImportFileName('');
                    setErrorMessage(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg border border-slate-300 transition-colors cursor-pointer"
                >
                  Ganti File
                </button>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Gagal memproses file:</span> {errorMessage}
              </div>
            </div>
          )}

          {/* Pilihan Mode Smart Merge & Analisis Data */}
          {importedRows.length > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>Metode Penggabungan Mutasi Masuk:</span>
                </label>
                <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                  {importMode === 'merge' ? 'Mode: Smart Merge (Aman)' : 'Mode: Timpa Total'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Opsi 1: Smart Merge */}
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
                      name="importModeMasuk"
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
                        Memperbarui data yang cocok (berdasarkan NISN / Nama Siswa) &amp; menambahkan data mutasi baru. Data mutasi masuk lama <strong>tetap aman tidak terhapus</strong>.
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
                      name="importModeMasuk"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800">Timpa Total (Replace All)</span>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        Mengganti seluruh daftar riwayat mutasi masuk hanya dengan data dari file Excel ini saja.
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
                    <span className="text-slate-600">Di Excel: <strong className="text-slate-800">{importedRows.length}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="text-slate-600">Akan Diperbarui: <strong className="text-amber-700">{stats.matchingCount}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-slate-600">Mutasi Baru: <strong className="text-emerald-700">{stats.newCount}</strong></span>
                  </div>
                  {importMode === 'merge' && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                      <span className="text-slate-600">Data Lama Aman: <strong className="text-slate-700">{stats.retainedCount}</strong></span>
                    </div>
                  )}
                </div>
                <div className="font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                  Total Akhir: {stats.finalTotal} Data
                </div>
              </div>
            </div>
          )}

          {/* Tabel Pratinjau */}
          {importedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  Pratinjau Data Mutasi Masuk ({importedRows.length} data terbaca):
                </span>
                <span className="text-[11px] text-slate-500">
                  Menampilkan maks. 50 baris teratas
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200 z-10 font-bold">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                      <th className="py-2.5 px-3 min-w-[110px]">NISN</th>
                      <th className="py-2.5 px-3 min-w-[150px]">Nama Siswa</th>
                      <th className="py-2.5 px-3 min-w-[120px]">Provinsi</th>
                      <th className="py-2.5 px-3 min-w-[120px]">Kab/Kota</th>
                      <th className="py-2.5 px-3 min-w-[120px]">Kecamatan</th>
                      <th className="py-2.5 px-3 min-w-[140px]">Sekolah Asal</th>
                      <th className="py-2.5 px-3 min-w-[110px]">Rombel Tujuan</th>
                      <th className="py-2.5 px-3 w-20 text-center">Status</th>
                      <th className="py-2.5 px-3 min-w-[120px]">Petugas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importedRows.slice(0, 50).map((row, i) => (
                      <tr key={row.id || i} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400 font-medium">{i + 1}</td>
                        <td className="py-2 px-3 font-mono text-slate-700 font-semibold">{row.nisn || '-'}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{row.nama || '-'}</td>
                        <td className="py-2 px-3 text-slate-600">{row.provinsiNama || '-'}</td>
                        <td className="py-2 px-3 text-slate-600">{row.kabKotaNama || '-'}</td>
                        <td className="py-2 px-3 text-slate-600">{row.kecamatanNama || '-'}</td>
                        <td className="py-2 px-3 text-slate-700">{row.sekolahAsal || '-'}</td>
                        <td className="py-2 px-3 text-indigo-700 font-medium">{row.rombelTujuan || '-'}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.status === 'Diterima' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {row.status || 'Pending'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">{row.verval_oleh || '-'}</td>
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
            Tip: NISN diformat teks murni agar angka nol di awal tidak hilang.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setImportedRows([]);
                setImportFileName('');
                setErrorMessage(null);
                onClose();
              }}
              disabled={isProcessing}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={importedRows.length === 0 || isProcessing}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                importMode === 'merge' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menyimpan ke Spreadsheet...</span>
                </>
              ) : importMode === 'merge' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Terapkan Smart Merge (Total: {stats.finalTotal} Data)</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Terapkan Timpa Total ({importedRows.length} Data)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
