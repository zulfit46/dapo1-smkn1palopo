import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PembelajaranData } from '../types';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  RefreshCw, 
  Layers, 
  BookOpen, 
  Info, 
  ShieldCheck, 
  Eye
} from 'lucide-react';
import { formatToDDMMYYYY } from '../utils/dateUtils';

export const PEMBELAJARAN_OFFICIAL_HEADERS = [
  'No', 'Jenis Rombel', 'Tingkat', 'Nama Rombel', 'Kurikulum', 'Program/Kompetensi Keahlian',
  'Nama PTK', 'NUPTK', 'PTK Induk', 'Kepegawaian', 'Nama Matpel', 'Kode Matpel',
  'JJM', 'Jml Siswa', 'Tgl SK Mengajar', 'SK Mengajar', 'Status di Kurikulum'
];

interface PembelajaranImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPembelajaranList: PembelajaranData[];
  onApplyImport: (
    finalList: PembelajaranData[], 
    mode: 'merge' | 'replace', 
    stats: { matchingCount: number; newCount: number; retainedCount: number; finalTotal: number }
  ) => Promise<void> | void;
}

export const PembelajaranImportModal: React.FC<PembelajaranImportModalProps> = ({
  isOpen,
  onClose,
  currentPembelajaranList,
  onApplyImport
}) => {
  const [importedRows, setImportedRows] = useState<PembelajaranData[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge'); // Default: Smart Merge
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cleanStr = (val: any) => String(val || '').trim().toLowerCase();
  const cleanId = (val: any) => String(val || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  // Analisis statistik kecocokan data (berdasarkan Nama PTK/NUPTK + Nama Rombel + Nama Matpel)
  const stats = useMemo(() => {
    if (importedRows.length === 0) {
      return {
        matchingCount: 0,
        newCount: 0,
        retainedCount: currentPembelajaranList.length,
        finalTotal: currentPembelajaranList.length
      };
    }

    let matchingCount = 0;
    importedRows.forEach((row) => {
      const rowPtk = cleanId(row.nuptk) || cleanStr(row.namaPtk);
      const rowRombel = cleanStr(row.namaRombel);
      const rowMatpel = cleanStr(row.namaMatpel);

      const isMatch = currentPembelajaranList.some((p) => {
        const pPtk = cleanId(p.nuptk) || cleanStr(p.namaPtk);
        const pRombel = cleanStr(p.namaRombel);
        const pMatpel = cleanStr(p.namaMatpel);
        return rowPtk === pPtk && rowRombel === pRombel && rowMatpel === pMatpel;
      });

      if (isMatch) matchingCount++;
    });

    const newCount = importedRows.length - matchingCount;
    const retainedCount = Math.max(0, currentPembelajaranList.length - matchingCount);
    const finalTotal = importMode === 'merge' ? currentPembelajaranList.length + newCount : importedRows.length;

    return {
      matchingCount,
      newCount,
      retainedCount,
      finalTotal
    };
  }, [importedRows, currentPembelajaranList, importMode]);

  if (!isOpen) return null;

  // Unduh Template Excel Pembelajaran Resmi
  const handleDownloadTemplate = () => {
    const sampleRows = [
      [
        1, 'Kelas Utama', '10', 'X RPL 1', 'Kurikulum Merdeka', 'Pengembangan Perangkat Lunak dan Gim',
        'Drs. H. Ahmad Fauzi, M.Pd.', '1234567890123456', 'Induk', 'PNS', 'Dasar-dasar Pengembangan Perangkat Lunak',
        'DPLG10', 4, 36, '15/07/2024', '421.5/120/SMKN1/2024', 'Wajib'
      ],
      [
        2, 'Kelas Utama', '11', 'XI RPL 2', 'Kurikulum Merdeka', 'Pengembangan Perangkat Lunak dan Gim',
        'Siti Rahmawati, S.Pd.', '9876543210987654', 'Induk', 'PNS', 'Pemrograman Web dan Perangkat Bergerak',
        'PWPB11', 6, 35, '15/07/2024', '421.5/120/SMKN1/2024', 'Wajib'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([PEMBELAJARAN_OFFICIAL_HEADERS, ...sampleRows]);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Q3');

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cell_ref]) continue;
        ws[cell_ref].z = '@';
        ws[cell_ref].t = 's';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'pembelajaran');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Template_Smart_Impor_Pembelajaran_${today}.xlsx`);
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
          return s.includes('belajar') || s.includes('jadwal') || s.includes('matpel') || s.includes('kurikulum');
        }) || workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error('Sheet data pembelajaran tidak ditemukan dalam berkas Excel.');
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

        const parsedList: PembelajaranData[] = [];

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.every((c: any) => String(c || '').trim() === '')) continue;

          const namaPtk = getColVal(row, 'Nama PTK', 'Nama Guru', 'Nama', 'namaPtk');
          const nuptk = getColVal(row, 'NUPTK', 'nuptk');
          const namaMatpel = getColVal(row, 'Nama Matpel', 'Mata Pelajaran', 'Matpel', 'namaMatpel');
          const namaRombel = getColVal(row, 'Nama Rombel', 'Rombel', 'Kelas', 'namaRombel');
          const jenisRombel = getColVal(row, 'Jenis Rombel', 'jenisRombel') || 'Kelas Utama';
          const tingkat = getColVal(row, 'Tingkat', 'tingkat') || '10';
          const kurikulum = getColVal(row, 'Kurikulum', 'kurikulum') || 'Kurikulum Merdeka';
          const programKeahlian = getColVal(row, 'Program/Kompetensi Keahlian', 'Program Keahlian', 'programKeahlian');
          const ptkInduk = getColVal(row, 'PTK Induk', 'ptkInduk') || 'Induk';
          const kepegawaian = getColVal(row, 'Kepegawaian', 'kepegawaian') || 'PNS';
          const kodeMatpel = getColVal(row, 'Kode Matpel', 'kodeMatpel');
          const jjm = parseInt(getColVal(row, 'JJM', 'jjm', 'Jam Mengajar') || '0', 10);
          const jmlSiswa = parseInt(getColVal(row, 'Jml Siswa', 'Jumlah Siswa', 'jmlSiswa') || '0', 10);
          const tglSkMengajar = getColVal(row, 'Tgl SK Mengajar', 'tglSkMengajar', 'Tanggal SK');
          const skMengajar = getColVal(row, 'SK Mengajar', 'skMengajar', 'Nomor SK');
          const statusDiKurikulum = getColVal(row, 'Status di Kurikulum', 'statusDiKurikulum') || 'Wajib';

          if (!namaPtk && !namaMatpel && !namaRombel) continue;

          parsedList.push({
            id: `PEMB-${cleanId(nuptk) || cleanId(namaPtk)}-${cleanId(namaRombel)}-${cleanId(namaMatpel) || i}`,
            no: i,
            jenisRombel,
            tingkat,
            namaRombel,
            kurikulum,
            programKeahlian,
            namaPtk: namaPtk || '-',
            nuptk: nuptk || '',
            ptkInduk,
            kepegawaian,
            namaMatpel: namaMatpel || '-',
            kodeMatpel,
            jjm: isNaN(jjm) ? 0 : jjm,
            jmlSiswa: isNaN(jmlSiswa) ? 0 : jmlSiswa,
            tglSkMengajar: formatToDDMMYYYY(tglSkMengajar),
            skMengajar,
            statusDiKurikulum
          });
        }

        if (parsedList.length === 0) {
          throw new Error('Tidak ada baris data pembelajaran yang valid ditemukan.');
        }

        setImportedRows(parsedList);
      } catch (err: any) {
        console.error('Error membaca excel Pembelajaran:', err);
        setErrorMessage(err.message || 'Gagal memproses file Excel.');
        setImportedRows([]);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Simpan hasil impor
  const handleConfirmImport = async () => {
    if (importedRows.length === 0) return;
    setIsProcessing(true);

    try {
      let finalList: PembelajaranData[] = [];

      if (importMode === 'replace') {
        finalList = importedRows.map((item, idx) => ({ ...item, no: idx + 1 }));
      } else {
        const map = new Map<string, PembelajaranData>();

        currentPembelajaranList.forEach((existing) => {
          const key = `${cleanId(existing.nuptk) || cleanStr(existing.namaPtk)}_${cleanStr(existing.namaRombel)}_${cleanStr(existing.namaMatpel)}`;
          map.set(key, { ...existing });
        });

        importedRows.forEach((incoming) => {
          const key = `${cleanId(incoming.nuptk) || cleanStr(incoming.namaPtk)}_${cleanStr(incoming.namaRombel)}_${cleanStr(incoming.namaMatpel)}`;
          if (map.has(key)) {
            const prev = map.get(key)!;
            map.set(key, { ...prev, ...incoming });
          } else {
            map.set(key, incoming);
          }
        });

        finalList = Array.from(map.values()).map((item, idx) => ({ ...item, no: idx + 1 }));
      }

      await onApplyImport(finalList, importMode, stats);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menerapkan impor data pembelajaran.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header Modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl text-white">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                Smart Impor Pembelajaran & Beban Mengajar
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-amber-50">
                  Sheet: pembelajaran
                </span>
              </h3>
              <p className="text-xs text-amber-100">
                Pembaruan cerdas rombel, mata pelajaran, dan jam mengajar GTK dengan proteksi teks murni (@)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Konten Modal */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-slate-800">

          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Terjadi Kesalahan</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Unduh Template & Pilih File */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 bg-slate-50/70 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 text-slate-800 font-semibold mb-1">
                  <FileSpreadsheet className="w-5 h-5 text-amber-600" />
                  <h4>1. Unduh Template Excel</h4>
                </div>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  Gunakan format resmi pembelajaran (17 kolom: Jenis Rombel, Tingkat, Rombel, Kurikulum, Guru, Matpel, JJM, dll.).
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="w-full inline-flex items-center justify-center space-x-2 py-2 px-3 bg-white border border-amber-500 text-amber-700 font-medium rounded-lg hover:bg-amber-50 text-xs shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Template Pembelajaran</span>
              </button>
            </div>

            <div className="border border-dashed border-amber-300 bg-amber-50/30 p-4 rounded-xl flex flex-col justify-between items-center text-center">
              <div>
                <div className="flex items-center justify-center space-x-2 text-slate-800 font-semibold mb-1">
                  <Upload className="w-5 h-5 text-amber-600" />
                  <h4>2. Pilih File Excel</h4>
                </div>
                <p className="text-xs text-slate-500 mb-2">
                  Format berkas: <span className="font-semibold text-slate-700">.xlsx / .xls</span>
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
                id="file-pembelajaran-import"
              />

              <label
                htmlFor="file-pembelajaran-import"
                className="cursor-pointer inline-flex items-center space-x-2 py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-xs shadow-sm"
              >
                <Upload className="w-4 h-4" />
                <span>{importFileName ? 'Ganti File Excel' : 'Pilih Berkas Excel'}</span>
              </label>

              {importFileName && (
                <span className="text-xs text-amber-700 font-medium mt-1 truncate max-w-full">
                  Terpilih: {importFileName}
                </span>
              )}
            </div>
          </div>

          {/* Pilihan Metode Impor */}
          <div className="border border-slate-200 bg-white p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-600" />
              Pilih Metode Impor
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label 
                className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  importMode === 'merge' 
                    ? 'border-amber-500 bg-amber-50/60 shadow-sm' 
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="importModePembelajaran"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block flex items-center gap-1.5">
                    Smart Merge (Disarankan)
                    <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded font-semibold">Aman</span>
                  </span>
                  <span className="text-[11px] text-slate-500 leading-normal block mt-0.5">
                    Memperbarui jam & rincian mengajar guru untuk rombel yang sama, dan menambahkan penugasan matpel baru tanpa menghapus data lain.
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
                  name="importModePembelajaran"
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
                    Menghapus seluruh daftar pembelajaran saat ini dan menggantinya dengan jadwal baru di berkas Excel ini.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Kartu Ringkasan Analisis */}
          {importedRows.length > 0 && (
            <div className="bg-gradient-to-br from-slate-50 to-amber-50/40 border border-amber-100 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-amber-100/80 pb-2">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  Hasil Analisis Jadwal Pembelajaran ({importedRows.length} Baris Terbaca)
                </span>
                <span className="text-[11px] text-amber-700 font-semibold bg-amber-100/70 px-2 py-0.5 rounded-full">
                  Siap Diterapkan
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
                  <span className="text-[11px] text-slate-500 block">Total di Excel</span>
                  <span className="text-lg font-bold text-slate-800">{importedRows.length}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-amber-200 shadow-xs">
                  <span className="text-[11px] text-amber-600 font-medium block">Data Diperbarui</span>
                  <span className="text-lg font-bold text-amber-700">{stats.matchingCount}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-blue-200 shadow-xs">
                  <span className="text-[11px] text-blue-600 font-medium block">Data Baru</span>
                  <span className="text-lg font-bold text-blue-700">{stats.newCount}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-purple-200 shadow-xs">
                  <span className="text-[11px] text-purple-600 font-medium block">Total Akhir</span>
                  <span className="text-lg font-bold text-purple-700">{stats.finalTotal}</span>
                </div>
              </div>
            </div>
          )}

          {/* Pratinjau Baris */}
          {importedRows.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  Pratinjau Data Pembelajaran (Maksimal 10 Baris Pertama)
                </span>
                <span className="text-[11px] text-slate-500">
                  {Math.min(10, importedRows.length)} dari {importedRows.length} data
                </span>
              </div>
              <div className="overflow-x-auto max-h-56">
                <table className="w-full text-left text-xs text-slate-700 border-collapse">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 font-semibold">No</th>
                      <th className="py-2 px-3 font-semibold">Guru Pengampu</th>
                      <th className="py-2 px-3 font-semibold">Rombel</th>
                      <th className="py-2 px-3 font-semibold">Mata Pelajaran</th>
                      <th className="py-2 px-3 font-semibold">JJM</th>
                      <th className="py-2 px-3 font-semibold">Jml Siswa</th>
                      <th className="py-2 px-3 font-semibold">SK Mengajar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importedRows.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{row.namaPtk}</td>
                        <td className="py-2 px-3 font-semibold text-amber-700">{row.namaRombel}</td>
                        <td className="py-2 px-3 text-slate-800">{row.namaMatpel}</td>
                        <td className="py-2 px-3 font-bold text-slate-700">{row.jjm} Jam</td>
                        <td className="py-2 px-3">{row.jmlSiswa} Siswa</td>
                        <td className="py-2 px-3 font-mono text-slate-500">{row.skMengajar || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info className="w-4 h-4 text-slate-400" />
            <span>Format tanggal otomatis disesuaikan ke dd/MM/yyyy</span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importedRows.length === 0 || isProcessing}
              className="inline-flex items-center space-x-2 px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 rounded-xl shadow-md"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memproses...</span>
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
