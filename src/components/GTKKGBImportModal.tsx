import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { RiwayatKGB } from '../types';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  RefreshCw, 
  Layers, 
  TrendingUp, 
  Info, 
  ShieldCheck, 
  Eye
} from 'lucide-react';
import { formatToDDMMYYYY } from '../utils/dateUtils';

export const KGB_OFFICIAL_HEADERS = [
  'No', 'NIP', 'Nama', 'Gol', 'No_SK', 'tgl_SK', 'TMT', 'masa_kerja_thn', 'masa_kerja_bln', 'gaji_pokok_baru', 'tgl_mulai', 'Status', 'Keterangan', 'Timestamp'
];

interface GTKKGBImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRiwayatList: RiwayatKGB[];
  onApplyImport: (
    finalList: RiwayatKGB[], 
    mode: 'merge' | 'replace', 
    stats: { matchingCount: number; newCount: number; retainedCount: number; finalTotal: number }
  ) => Promise<void> | void;
}

export const GTKKGBImportModal: React.FC<GTKKGBImportModalProps> = ({
  isOpen,
  onClose,
  currentRiwayatList,
  onApplyImport
}) => {
  const [importedRows, setImportedRows] = useState<RiwayatKGB[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge'); // Default: Smart Merge
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cleanId = (val: any) => String(val || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  // Analisis statistik kecocokan data
  const stats = useMemo(() => {
    if (importedRows.length === 0) {
      return {
        matchingCount: 0,
        newCount: 0,
        retainedCount: currentRiwayatList.length,
        finalTotal: currentRiwayatList.length
      };
    }

    let matchingCount = 0;
    importedRows.forEach((row) => {
      const rowNip = cleanId(row.nip);
      const rowNoSk = cleanId(row.noSk);

      const isMatch = currentRiwayatList.some((k) => {
        const kNip = cleanId(k.nip);
        const kNoSk = cleanId(k.noSk);
        return (rowNip && kNip && rowNip === kNip && rowNoSk && kNoSk && rowNoSk === kNoSk) ||
               (rowNip && kNip && rowNip === kNip && !rowNoSk);
      });

      if (isMatch) matchingCount++;
    });

    const newCount = importedRows.length - matchingCount;
    const retainedCount = Math.max(0, currentRiwayatList.length - matchingCount);
    const finalTotal = importMode === 'merge' ? currentRiwayatList.length + newCount : importedRows.length;

    return {
      matchingCount,
      newCount,
      retainedCount,
      finalTotal
    };
  }, [importedRows, currentRiwayatList, importMode]);

  if (!isOpen) return null;

  // Unduh Template Excel KGB Resmi dengan Format Teks Murni (@)
  const handleDownloadTemplate = () => {
    const sampleRows = [
      [
        1, '197504152000031002', 'Drs. H. Ahmad Fauzi, M.Pd.', 'IV/b', '822/021/KGB/2023',
        '01/03/2023', '01/04/2023', 22, 0, 4850000, '01/04/2023', 'Aktif', 'Kenaikan Gaji Berkala Rutin', '01/03/2023 09:00:00'
      ],
      [
        2, '198207122008012015', 'Siti Rahmawati, S.Pd.', 'III/d', '822/045/KGB/2022',
        '01/09/2022', '01/10/2022', 14, 0, 3950000, '01/10/2022', 'Aktif', 'Kenaikan Gaji Berkala Rutin', '01/09/2022 10:15:00'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([KGB_OFFICIAL_HEADERS, ...sampleRows]);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:N3');

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cell_ref]) continue;
        ws[cell_ref].z = '@';
        ws[cell_ref].t = 's';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'kgb');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Template_Smart_Impor_KGB_${today}.xlsx`);
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
          return s.includes('kgb') || s.includes('berkala') || s.includes('gajiberkala');
        }) || workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error('Sheet data KGB tidak ditemukan dalam berkas Excel.');
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

        const parsedList: RiwayatKGB[] = [];

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.every((c: any) => String(c || '').trim() === '')) continue;

          const nip = getColVal(row, 'NIP', 'Nomor Induk Pegawai');
          const nama = getColVal(row, 'Nama', 'Nama Pegawai', 'Nama Lengkap');
          const gol = getColVal(row, 'Gol', 'Golongan', 'Pangkat');
          const noSk = getColVal(row, 'No_SK', 'No SK', 'Nomor SK', 'SK');
          const tglSk = getColVal(row, 'tgl_SK', 'Tanggal SK', 'Tgl SK');
          const tmt = getColVal(row, 'TMT', 'TMT KGB', 'TMT_kgb');
          const masaKerjaThn = parseInt(getColVal(row, 'masa_kerja_thn', 'masa_kerja_tahun', 'Masa Kerja Tahun', 'MK Thn') || '0', 10);
          const masaKerjaBln = parseInt(getColVal(row, 'masa_kerja_bln', 'Masa Kerja Bulan', 'MK Bln') || '0', 10);
          const rawGaji = getColVal(row, 'gaji_pokok_baru', 'Gaji Pokok', 'Gaji_Pokok', 'gajipokok', 'Gaji');
          const gajiPokok = parseInt(rawGaji.replace(/[^0-9]/g, '') || '0', 10);
          const status = getColVal(row, 'Status', 'Status KGB') || 'Aktif';
          const keterangan = getColVal(row, 'Keterangan', 'Ket');
          const timestamp = getColVal(row, 'Timestamp', 'Waktu') || new Date().toISOString();

          if (!nip && !nama) continue;

          parsedList.push({
            id: `KGB-${nip}-${cleanId(noSk) || i}`,
            no: i,
            nip: nip || '',
            nama: nama || '-',
            gol: gol || '-',
            noSk: noSk || '-',
            tglSk: formatToDDMMYYYY(tglSk),
            tmt: formatToDDMMYYYY(tmt),
            masaKerjaThn: isNaN(masaKerjaThn) ? 0 : masaKerjaThn,
            masaKerjaBln: isNaN(masaKerjaBln) ? 0 : masaKerjaBln,
            gajiPokok: isNaN(gajiPokok) ? 0 : gajiPokok,
            status,
            keterangan,
            timestamp
          });
        }

        if (parsedList.length === 0) {
          throw new Error('Tidak ada baris data KGB yang valid ditemukan.');
        }

        setImportedRows(parsedList);
      } catch (err: any) {
        console.error('Error membaca excel KGB:', err);
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
      let finalList: RiwayatKGB[] = [];

      if (importMode === 'replace') {
        finalList = importedRows.map((item, idx) => ({ ...item, no: idx + 1 }));
      } else {
        const map = new Map<string, RiwayatKGB>();

        currentRiwayatList.forEach((existing) => {
          const key = `${cleanId(existing.nip)}_${cleanId(existing.noSk)}`;
          map.set(key, { ...existing });
        });

        importedRows.forEach((incoming) => {
          const key = `${cleanId(incoming.nip)}_${cleanId(incoming.noSk)}`;
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
      setErrorMessage(err.message || 'Gagal menerapkan impor KGB.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header Modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl text-white">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                Smart Impor Kenaikan Gaji Berkala (KGB)
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-teal-50">
                  Sheet: kgb
                </span>
              </h3>
              <p className="text-xs text-teal-100">
                Pembaruan cerdas riwayat berkala gaji GTK dengan proteksi teks murni (@)
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
                  <FileSpreadsheet className="w-5 h-5 text-teal-600" />
                  <h4>1. Unduh Template Excel</h4>
                </div>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  Gunakan format resmi KGB (14 kolom) dengan format tanggal <span className="font-mono font-bold">dd/MM/yyyy</span> dan teks murni.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="w-full inline-flex items-center justify-center space-x-2 py-2 px-3 bg-white border border-teal-500 text-teal-700 font-medium rounded-lg hover:bg-teal-50 text-xs shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Template KGB</span>
              </button>
            </div>

            <div className="border border-dashed border-teal-300 bg-teal-50/30 p-4 rounded-xl flex flex-col justify-between items-center text-center">
              <div>
                <div className="flex items-center justify-center space-x-2 text-slate-800 font-semibold mb-1">
                  <Upload className="w-5 h-5 text-teal-600" />
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
                id="file-kgb-import"
              />

              <label
                htmlFor="file-kgb-import"
                className="cursor-pointer inline-flex items-center space-x-2 py-2 px-4 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg text-xs shadow-sm"
              >
                <Upload className="w-4 h-4" />
                <span>{importFileName ? 'Ganti File Excel' : 'Pilih Berkas Excel'}</span>
              </label>

              {importFileName && (
                <span className="text-xs text-teal-700 font-medium mt-1 truncate max-w-full">
                  Terpilih: {importFileName}
                </span>
              )}
            </div>
          </div>

          {/* Opsi Mode Impor */}
          <div className="border border-slate-200 bg-white p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-teal-600" />
              Pilih Metode Impor
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label 
                className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  importMode === 'merge' 
                    ? 'border-teal-500 bg-teal-50/60 shadow-sm' 
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="importModeKGB"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block flex items-center gap-1.5">
                    Smart Merge (Disarankan)
                    <span className="bg-teal-100 text-teal-800 text-[10px] px-1.5 py-0.2 rounded font-semibold">Aman</span>
                  </span>
                  <span className="text-[11px] text-slate-500 leading-normal block mt-0.5">
                    Memperbarui data jika NIP dan No. SK cocok, dan menambahkan riwayat baru tanpa menghapus data KGB sebelumnya.
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
                  name="importModeKGB"
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
                    Menghapus seluruh daftar riwayat KGB saat ini dan menggantinya dengan isi file Excel ini.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Kartu Ringkasan Analisis */}
          {importedRows.length > 0 && (
            <div className="bg-gradient-to-br from-slate-50 to-teal-50/40 border border-teal-100 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-teal-100/80 pb-2">
                <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  Hasil Analisis Data KGB ({importedRows.length} Baris Terbaca)
                </span>
                <span className="text-[11px] text-teal-700 font-semibold bg-teal-100/70 px-2 py-0.5 rounded-full">
                  Siap Diterapkan
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
                  <span className="text-[11px] text-slate-500 block">Total di Excel</span>
                  <span className="text-lg font-bold text-slate-800">{importedRows.length}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-teal-200 shadow-xs">
                  <span className="text-[11px] text-teal-600 font-medium block">Data Diperbarui</span>
                  <span className="text-lg font-bold text-teal-700">{stats.matchingCount}</span>
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
                  Pratinjau Data KGB (Maksimal 10 Baris Pertama)
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
                      <th className="py-2 px-3 font-semibold">NIP</th>
                      <th className="py-2 px-3 font-semibold">Nama Lengkap</th>
                      <th className="py-2 px-3 font-semibold">Gol</th>
                      <th className="py-2 px-3 font-semibold">No SK</th>
                      <th className="py-2 px-3 font-semibold">TMT</th>
                      <th className="py-2 px-3 font-semibold">Gaji Pokok Baru</th>
                      <th className="py-2 px-3 font-semibold">Masa Kerja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importedRows.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono text-slate-700">{row.nip}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{row.nama}</td>
                        <td className="py-2 px-3 font-semibold text-teal-700">{row.gol}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{row.noSk}</td>
                        <td className="py-2 px-3">{row.tmt}</td>
                        <td className="py-2 px-3 font-bold text-slate-800">
                          Rp {Number(row.gajiPokok || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2 px-3">{row.masaKerjaThn} Thn {row.masaKerjaBln} Bln</td>
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
              className="inline-flex items-center space-x-2 px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 disabled:opacity-50 rounded-xl shadow-md"
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
