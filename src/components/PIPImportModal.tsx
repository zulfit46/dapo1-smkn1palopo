import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Student, PIPData, PIPStatus } from '../types';
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
  UserX
} from 'lucide-react';

export interface PIPImportRow {
  nisn: string;
  nama: string;
  rombel: string;
  alasan_usul: string;
  status: PIPStatus | string;
  isMatchedInDatabase: boolean;
  rawNamaFromExcel?: string;
}

interface PIPImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  currentPipList: PIPData[];
  onApplyImport: (
    finalList: PIPData[], 
    mode: 'merge' | 'replace', 
    stats: { matchingCount: number; newCount: number; retainedCount: number; finalTotal: number; matchedStudentCount: number }
  ) => Promise<void> | void;
}

export const PIPImportModal: React.FC<PIPImportModalProps> = ({
  isOpen,
  onClose,
  students,
  currentPipList,
  onApplyImport
}) => {
  const [importedRows, setImportedRows] = useState<PIPImportRow[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge'); // Default: Smart Merge
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Map NISN ke Data Siswa untuk lookup secepat kilat (O(1))
  const studentNisnMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((s) => {
      const clean = (s.nisn || '').trim();
      if (clean) map.set(clean, s);
    });
    return map;
  }, [students]);

  // Analisis statistik kecocokan data
  const stats = useMemo(() => {
    if (importedRows.length === 0) {
      return {
        matchingCount: 0,
        newCount: 0,
        retainedCount: currentPipList.length,
        finalTotal: currentPipList.length,
        matchedStudentCount: 0
      };
    }

    let matchingCount = 0;
    let matchedStudentCount = 0;

    importedRows.forEach((row) => {
      if (row.isMatchedInDatabase) matchedStudentCount++;
      const existsInPIP = currentPipList.some(
        (p) => (p.nisn && p.nisn.trim() === row.nisn.trim()) || 
               (p.nama && row.nama && p.nama.trim().toLowerCase() === row.nama.trim().toLowerCase())
      );
      if (existsInPIP) matchingCount++;
    });

    const newCount = importedRows.length - matchingCount;
    const retainedCount = Math.max(0, currentPipList.length - matchingCount);
    const finalTotal = importMode === 'merge' ? currentPipList.length + newCount : importedRows.length;

    return {
      matchingCount,
      newCount,
      retainedCount,
      finalTotal,
      matchedStudentCount
    };
  }, [importedRows, currentPipList, importMode]);

  if (!isOpen) return null;

  // Unduh Template Resmi Excel Usulan PIP yang Disederhanakan (3 Kolom: NISN, alasan_usul, Status)
  const handleDownloadTemplate = () => {
    const headers = ['NISN', 'alasan_usul', 'Status'];
    const sampleRows = [
      ['0081234567', 'Desil 1-4', 'Usulan Sekolah'],
      ['0087654321', 'Rentan Putus Sekolah', 'Usulan Sekolah'],
      ['0076543210', 'Yatim dan atau Piatu', 'Usulan Luar']
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    // Format sel teks murni (@)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:C4');
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
    XLSX.utils.book_append_sheet(wb, ws, 'pip');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Template_Usulan_PIP_3_Kolom_${today}.xlsx`);
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
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('pip')) || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
          throw new Error('Sheet data PIP tidak ditemukan dalam berkas Excel.');
        }

        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
        if (rawJson.length === 0) {
          throw new Error('Berkas Excel tidak memiliki baris data.');
        }

        const parsed: PIPImportRow[] = [];

        rawJson.forEach((row) => {
          // Helper pencarian nilai kolom tanpa sensitif huruf/karakter
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
          const rawNama = getVal('Nama_Murid', 'Nama Murid', 'Nama Siswa', 'Nama', 'nama');
          const alasanUsul = getVal('alasan_usul', 'alasan_layak', 'alasanLayak', 'alasan', 'alasanusul');
          const rawStatus = getVal('Status', 'status', 'status_usulan');

          // Normalisasi status usulan
          let status: PIPStatus = 'Belum diusul';
          if (rawStatus.toLowerCase().includes('sekolah')) status = 'Usulan Sekolah';
          else if (rawStatus.toLowerCase().includes('luar')) status = 'Usulan Luar';
          else if (rawStatus.toLowerCase().includes('usul') || rawStatus.toLowerCase().includes('layak')) status = 'Usulan Sekolah';

          // Otomatis lookup nama & rombel siswa dari data siswa sheet "data" berdasarkan NISN
          const matchedStudent = nisn ? studentNisnMap.get(nisn) : undefined;
          const nama = matchedStudent?.nama || rawNama || '(Nama tidak ditemukan)';
          const rombel = matchedStudent?.kelas || '-';
          const isMatched = Boolean(matchedStudent);

          if (nisn || rawNama) {
            parsed.push({
              nisn,
              nama,
              rombel,
              alasan_usul: alasanUsul,
              status,
              isMatchedInDatabase: isMatched,
              rawNamaFromExcel: rawNama
            });
          }
        });

        if (parsed.length === 0) {
          throw new Error('Tidak ditemukan baris data NISN yang valid. Pastikan header sesuai (NISN, alasan_usul, Status).');
        }

        setImportedRows(parsed);
      } catch (err: any) {
        setErrorMessage(err?.message || 'Gagal memproses berkas Excel.');
        setImportedRows([]);
      }
    };

    reader.onerror = () => {
      setErrorMessage('Gagal membaca berkas dari penyimpanan.');
      setImportedRows([]);
    };

    reader.readAsArrayBuffer(file);
  };

  const handleApply = async () => {
    if (importedRows.length === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      let finalList: PIPData[] = [];

      if (importMode === 'merge') {
        const merged = [...currentPipList];
        importedRows.forEach((imp) => {
          const tNisn = imp.nisn.trim();
          const tNama = imp.nama.trim().toLowerCase();

          const matchIdx = merged.findIndex((p) => {
            const pNisn = (p.nisn || '').trim();
            const pNama = (p.nama || '').trim().toLowerCase();
            return (tNisn && pNisn && tNisn === pNisn) || (tNama && pNama && tNama === pNama && tNama.length > 2);
          });

          if (matchIdx !== -1) {
            // Update data usulan yang cocok
            merged[matchIdx] = {
              ...merged[matchIdx],
              nama: imp.nama !== '(Nama tidak ditemukan)' ? imp.nama : merged[matchIdx].nama,
              rombel: imp.rombel !== '-' ? imp.rombel : merged[matchIdx].rombel,
              alasan_layak: imp.alasan_usul || merged[matchIdx].alasan_layak || '',
              alasanLayak: imp.alasan_usul || merged[matchIdx].alasanLayak || '',
              status: imp.status || merged[matchIdx].status || 'Belum diusul'
            };
          } else {
            // Tambahkan sebagai entri usulan baru
            merged.push({
              no: merged.length + 1,
              nisn: imp.nisn,
              nama: imp.nama,
              rombel: imp.rombel,
              alasan_layak: imp.alasan_usul,
              alasanLayak: imp.alasan_usul,
              status: imp.status,
              rowIndex: merged.length + 2
            });
          }
        });
        finalList = merged;
      } else {
        // Timpa Total (Replace All)
        finalList = importedRows.map((r, idx) => ({
          no: idx + 1,
          nisn: r.nisn,
          nama: r.nama,
          rombel: r.rombel,
          alasan_layak: r.alasan_usul,
          alasanLayak: r.alasan_usul,
          status: r.status,
          rowIndex: idx + 2
        }));
      }

      await onApplyImport(finalList, importMode, stats);

      setTimeout(() => {
        setIsProcessing(false);
        setImportedRows([]);
        setImportFileName('');
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal menyimpan hasil impor usulan PIP.');
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
                  Smart Impor Usulan PIP (Excel)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  Format Ringkas 3 Kolom
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Nama siswa &amp; rombel otomatis ditarik dari sheet &quot;data&quot; berdasarkan NISN
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
                  Format Ringkas 3 Kolom (Cukup NISN, Alasan, Status):
                </p>
                <p className="text-slate-600 mt-0.5 text-[11px] leading-relaxed font-mono">
                  NISN | alasan_usul | Status
                </p>
                <p className="text-[11px] text-emerald-800 font-medium mt-1">
                  💡 Nama dan Rombel tidak perlu diisi manual, sistem otomatis mencocokkannya dari database siswa! (Format 4 kolom dengan Nama_Murid juga tetap didukung).
                </p>
              </div>
            </div>
            <button
              onClick={handleDownloadTemplate}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-indigo-700 font-semibold text-xs rounded-xl border border-indigo-300 shadow-2xs transition-colors shrink-0 cursor-pointer"
              title="Unduh format template Excel Usulan PIP"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Template (3 Kolom)</span>
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
                  Pilih Berkas Excel Usulan PIP (.xlsx / .xls)
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Cukup sertakan NISN, alasan_usul, dan Status
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
                      ✓ {importedRows.length} data usulan PIP berhasil dibaca dari berkas
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
                <span className="font-bold">Gagal memproses berkas:</span> {errorMessage}
              </div>
            </div>
          )}

          {/* Pilihan Mode Smart Merge & Analisis Data */}
          {importedRows.length > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>Metode Penggabungan Usulan PIP:</span>
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
                      name="importModePIP"
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
                        Memperbarui usulan yang cocok (berdasarkan NISN) &amp; menambahkan usulan siswa baru. Usulan siswa lain yang tidak ada di file Excel <strong>tetap aman tersimpan (tidak terhapus)</strong>.
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
                      name="importModePIP"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800">Timpa Total (Replace All)</span>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        Mengganti seluruh daftar usulan PIP hanya dengan data yang ada di file Excel ini saja.
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
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-slate-600">Siswa Cocok Database: <strong className="text-emerald-700">{stats.matchedStudentCount}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="text-slate-600">Akan Diperbarui: <strong className="text-amber-700">{stats.matchingCount}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                    <span className="text-slate-600">Usulan Baru: <strong className="text-indigo-700">{stats.newCount}</strong></span>
                  </div>
                  {importMode === 'merge' && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                      <span className="text-slate-600">Data Lain Aman: <strong className="text-slate-700">{stats.retainedCount}</strong></span>
                    </div>
                  )}
                </div>
                <div className="font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                  Total Akhir: {stats.finalTotal} Usulan
                </div>
              </div>
            </div>
          )}

          {/* Tabel Pratinjau */}
          {importedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  Pratinjau Data Usulan PIP ({importedRows.length} data terbaca):
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
                      <th className="py-2.5 px-3 min-w-[180px]">Nama Siswa (Otomatis)</th>
                      <th className="py-2.5 px-3 min-w-[100px]">Rombel</th>
                      <th className="py-2.5 px-3 min-w-[150px]">Alasan Usul</th>
                      <th className="py-2.5 px-3 w-28 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importedRows.slice(0, 50).map((row, i) => (
                      <tr key={`imp-pip-${row.nisn}-${i}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400 font-medium">{i + 1}</td>
                        <td className="py-2 px-3 font-mono text-slate-700 font-semibold">{row.nisn || '-'}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            {row.isMatchedInDatabase ? (
                              <span title="Ditemukan di sheet data" className="inline-flex">
                                <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              </span>
                            ) : (
                              <span title="Tidak ditemukan di sheet data" className="inline-flex">
                                <UserX className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              </span>
                            )}
                            <span className={`font-semibold ${row.isMatchedInDatabase ? 'text-slate-900' : 'text-rose-600'}`}>
                              {row.nama}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-indigo-700 font-medium">{row.rombel}</td>
                        <td className="py-2 px-3 text-slate-700">
                          {row.alasan_usul ? (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-medium">
                              {row.alasan_usul}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Belum ditentukan</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.status === 'Usulan Sekolah'
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.status === 'Usulan Luar'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {row.status || 'Belum diusul'}
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
            Tip: Saat disimpan ke spreadsheet, Nama Murid otomatis diisikan lengkap 4 kolom.
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
                  <span>Terapkan Smart Merge (Total: {stats.finalTotal} Usulan)</span>
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
