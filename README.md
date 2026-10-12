# Perspektif

Yeni başlayanlar ve amatörler için tarayıcıda çalışan, minimalist bir perspektif çizim aracı.
Kaçış noktalarını yerleştirin, hayalet kılavuz ışınlarını görün; fırça bu ışınlara mıknatıs gibi
kilitlenerek düzgün perspektif çizgileri çizer. Çalışmanız tarayıcıda otomatik kaydedilir,
PNG olarak indirilebilir ya da A4'e yazdırılabilir.

Hesap ve sunucu yoktur; her şey tarayıcınızda kalır.

## Özellikler

- 1 ve 2 nokta perspektif; kaçış noktaları kâğıt dışına da konabilir
- Hayalet ışınlar (12–72), imleç yaklaştıkça ilgili noktanın ışınları belirginleşir
- Ufuk 2 noktada varsayılan olarak kilitli, istenirse serbest bırakılır
- Mıknatıs: çizgi kaçış noktasına, dikeye (1 noktada yataya da) kilitlenir; `Space` ile geçici serbest çizim
- Fırça (kalınlık, opaklık, yumuşatma, 8 renk), silgi (bütün çizgi ya da kısmi/piksel), geri al / ileri al
- A4, A5, kare ve ekran boyu kâğıt (A4/A5 için dikey ya da yatay, varsayılan dikey; çizim varsa çizgiler ve kaçış noktaları kâğıtla birlikte döner); sonsuz kaydırma ve yakınlaştırma
- Otomatik kayıt (IndexedDB), PNG ve SVG (gerçek ölçek) dışa aktarma, A4 yazdırma (yalnızca çizim / kılavuzlarla)
- Proje dosyası (.json) kaydet / aç; dosyayı tuvale sürükleyip bırakarak da açılır
- Şablonlar: küp, yol, oda, oda köşesi (üzerinden geçilecek açık gri kılavuzlarla) ve boş 1/2 nokta
- İlk kullanımda boş tuvalde tek satırlık ipucu
- Türkçe ve İngilizce arayüz

Klavye kısayolları uygulama içinde `?` ile açılır.

## Geliştirme

Node.js 20.19+ veya 22.12+ gerekir (Vite 8).

```bash
npm install
npm run dev        # geliştirme sunucusu
npm test           # birim testleri (Vitest)
npm run build      # tip kontrolü + üretim derlemesi (dist/)
npm run preview    # derlenmiş sürümü yerelde aç
```

## Yayınlama

`npm run build` çıktısı (`dist/`) tamamen statiktir; Vercel, Netlify veya GitHub Pages'e olduğu gibi
yüklenebilir. `vite.config.ts` içindeki `base: './'` sayesinde alt dizinde (ör. `kullanici.github.io/perspektive/`)
de çalışır.

## Yapı

```
src/
  main.ts            giriş noktası, bileşenleri birbirine bağlar
  engine/            viewport, katmanlar, stroke modeli, belge, geri al (komutlar), render
  perspective/       kaçış noktaları, ışın üretimi, snapping
  tools/             Tool arayüzü, fırça, StrokeEraser, kaçış noktası, el
  ui/                araç çubuğu, paneller, çıktı diyaloğu, yazdırma görünümü
  i18n/              tr.json, en.json, çeviri yardımcıları
  storage/           otomatik kayıt, tercihler, kayıt biçimi doğrulama
  styles/            tema değişkenleri (açık tema), arayüz stilleri
```

Ayrıntılı kapsam ve aşamalar için [PROJECT.md](PROJECT.md).

## Tarayıcı desteği

Hedef: güncel Chrome, Edge, Firefox ve Safari (masaüstü, fare). Şu ana kadar Chromium tabanlı
tarayıcıda test edildi; Firefox ve Safari'de elle denenmesi gerekiyor. Dokunmatik/kalem desteği sonraki
sürümlerde; girdi katmanı Pointer Events ile yazıldığı için hazırlık mevcuttur.
