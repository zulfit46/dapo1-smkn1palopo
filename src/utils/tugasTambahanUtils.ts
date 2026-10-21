/**
 * Utility untuk normalisasi dan ekstraksi tugas tambahan GTK
 * Sesuai aturan:
 * - Tugas tambahan Bendahara BOS dan BOP itu sama, jadi terhitung hanya 1 tugas tambahan (Bendahara BOS/BOP)
 */

export interface ParsedTugasItem {
  id: string;
  namaTugas: string;
  kategori: string;
  jam?: string | number;
}

// Cek apakah suatu teks merujuk pada tugas Bendahara BOS atau BOP
export const isBendaharaBosBop = (text: string): boolean => {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  if (!t || t === '-') return false;

  // Kecualikan tugas yang bukan BOS/BOP (misal koperasi/komite sekolah khusus)
  if (t.includes('koperasi') || t.includes('komite') || t.includes('masjid')) {
    return false;
  }

  // Jika mengandung kata kunci bos, bop, atau bendahara
  if (t.includes('bos') || t.includes('bop') || t.includes('bendahara')) {
    return true;
  }

  return false;
};

// Normalisasi nama tugas tunggal
export const normalizeTugasName = (text: string): string => {
  const clean = text.replace(/^\s*\d+[\.\)]\s*/, '').trim();
  if (isBendaharaBosBop(clean)) {
    return 'Bendahara BOS/BOP';
  }
  return clean;
};

/**
 * Normalisasi string mentah tugasTambahan menjadi array tugas yang bersih.
 * Aturan:
 * - Bendahara BOS dan BOP dihitung sebagai SATU tugas: 'Bendahara BOS/BOP'
 * - Jika seorang GTK memiliki Bendahara BOS dan Bendahara BOP, hanya dihitung 1 kali.
 */
export const normalizeRawTugasString = (raw: string): string[] => {
  if (!raw || raw.trim() === '-' || raw.trim() === '') return [];

  // Lindungi 'BOS/BOP' agar tidak terbelah oleh pemisah garis miring (/)
  const protectedText = raw.replace(/bos\s*[\/\\]\s*bop/gi, '__BOS_BOP_TOKEN__');

  // Pisahkan berdasarkan baris baru, koma, titik koma, atau garis miring
  const splitted = protectedText
    .split(/[\r\n;,/]+/)
    .map(s => s.replace(/__BOS_BOP_TOKEN__/g, 'BOS/BOP').replace(/^\s*\d+[\.\)]\s*/, '').trim())
    .filter(s => Boolean(s) && s !== '-');

  const result: string[] = [];
  let hasBendaharaBosBop = false;

  for (const item of splitted) {
    if (isBendaharaBosBop(item)) {
      if (!hasBendaharaBosBop) {
        hasBendaharaBosBop = true;
        result.push('Bendahara BOS/BOP');
      }
    } else {
      // Pastikan tidak ada duplikasi teks yang sama
      if (!result.some(r => r.toLowerCase() === item.toLowerCase())) {
        result.push(item);
      }
    }
  }

  return result;
};

// Klasifikasi kategori tugas tambahan untuk penandaan badge yang rapi
export const classifyTugasCategory = (tugas: string): string => {
  const t = tugas.toLowerCase();
  if (t.includes('wali kelas') || t.includes('walikelas')) return 'Wali Kelas';
  if (t.includes('piket') || t.includes('guru piket')) return 'Guru Piket';
  if (isBendaharaBosBop(t)) return 'Bendahara BOS/BOP';
  if (t.includes('kepala sekolah') || t.includes('kepala tata usaha') || t.includes('wakil kepala') || t.includes('wakasek')) return 'Manajemen';
  if (t.includes('laboratorium') || t.includes('lab') || t.includes('bengkel')) return 'Kepala Lab / Bengkel';
  if (t.includes('perpustakaan') || t.includes('pustaka')) return 'Perpustakaan';
  if (t.includes('bk') || t.includes('bimbingan')) return 'Bimbingan Konseling';
  if (t.includes('osis') || t.includes('pembina') || t.includes('ekstrakurikuler') || t.includes('pramuka')) return 'Pembina Ekstra';
  if (t.includes('jurusan') || t.includes('program keahlian') || t.includes('kaprog')) return 'Ketua Program';
  return 'Tugas Lain';
};
