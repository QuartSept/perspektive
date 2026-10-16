# Perspektif

Yeni başlayanlar ve amatörler için tarayıcıda çalışan, minimalist bir perspektif çizim aracı.
Kaçış noktalarını yerleştirin, hayalet kılavuz ışınlarını görün; fırça bu ışınlara mıknatıs gibi
kilitlenerek düzgün perspektif çizgileri çizer. Çalışmanız tarayıcıda otomatik kaydedilir,
PNG olarak indirilebilir ya da A4'e yazdırılabilir.

Hesap ve sunucu yoktur; her şey tarayıcınızda kalır.

## Özellikler

- 1, 2 ve 3 nokta perspektif (3 noktada dikey kaçış noktası: kuşbakışı / solucan bakışı); kaçış noktaları kâğıt dışına da konabilir
- Perspektif kapatılabilir: her yöne düz çizgi (başlangıç → bitiş), yatay/dikeye yapışma; kurgu saklanır
- Kâğıt ızgarası (5 / 10 / 20 mm, gerçek ölçek): göster ve ızgaraya yapış ayrı; gizliyken yapışma açıksa görünmez cetvel. Ayar çizimle kaydedilir, "kılavuzlarla" çıktılara girer
- Hayalet ışınlar (12–72), imleç yaklaştıkça ilgili noktanın ışınları belirginleşir
- İmleç çizgileri: fırça seçiliyken imleçten her kaçış noktasına ince, soluk çizgi (kılavuzlar `G` ile gizliyken de görünür; panelden kapatılabilir)
- Kaçış noktası her araçta (fırça, şekil, seç) tutulup taşınabilir; boyutu ayarlanabilir, "Merkeze al" ile kâğıt merkezine yerleşir, taşırken merkez eksenlerine yapışır (`Shift` ile kapalı)
- "Merkeze git" (`C`): görünüm ölçeği koruyarak kâğıdın ortasına kayar; isteğe bağlı merkez çizgileri
- Görünümü döndürme (kâğıdı masada çevirmek gibi; çizim ve çıktılar etkilenmez): iki parmakla ya da `R` + sürükle (`Shift`: 15°), düz hizaya hafif yapışma; dönükken pusula, tıklayınca ya da `Shift+R` ile sıfırlanır
- Ufuk 2 noktada varsayılan olarak kilitli, istenirse serbest bırakılır
- Mıknatıs: çizgi kaçış noktasına, dikeye (1 noktada yataya da) kilitlenir; `Alt` basılıyken geçici serbest çizim
- Fırça (kalınlık, opaklık, yumuşatma, 8 renk), silgi (kesişimden kesişime parça, bütün çizgi ya da kısmi/piksel), geri al / ileri al
- Katmanlar (en fazla 20): ekle, çoğalt, sırala, birleştir, sil, göster/gizle, kilitle, opaklık, yeniden adlandır; silgi yalnızca etkin katmanda (isteğe bağlı tümü), kilitli/gizli katmana dokunulmaz; gizli katmanlar çıktıya girmez, SVG'de her katman ayrı grup
- Şekiller: doğru parçası, dikdörtgen, üçgen, çokgen (tıkla-tıkla); köşeler ızgaraya, kenarlar kaçış ışınlarına / eksenlere yapışır; silgi şekli bütün olarak ya da (parça / kısmi silgide) kenar kenar siler; kenarı silinen şeklin köşeleri düzenlenebilir kalır
- Seç / düzenle: şekle tıkla, köşe tutamacını sürükle (dikdörtgen karşı köşesi sabit yeniden boyutlanır) ya da şekli taşı; Delete ile sil
- Derinlikli kutu: seçili dikdörtgen bir kaçış noktasına (1 nokta), seçili dikey doğru parçası iki ufuk noktasına (2 nokta) doğru "Kutuya dönüştür" ile kutu olur; derinlik kaydırıcılardan ya da köşelerden, arka kenarlar kesikli / görünür / gizli; kaçış noktaları taşınınca kutu uyar; "Çizgilere dönüştür" şekli düz çizgilere çevirir
- Köşe kaçış çizgileri: şekil köşelerinden kaçış noktalarına kesikli kılavuzlar (hepsine ya da seçilen noktaya; şekil başına kapatılabilir); fırça bu çizgilere kilitlenir, "kılavuzlarla" çıktılara girer
- A4, A5, kare ve ekran boyu kâğıt (A4/A5 için dikey ya da yatay, varsayılan dikey; çizim varsa çizgiler ve kaçış noktaları kâğıtla birlikte döner); sonsuz kaydırma ve yakınlaştırma
- Otomatik kayıt (IndexedDB), PNG ve SVG (gerçek ölçek) dışa aktarma, A4 yazdırma (yalnızca çizim / kılavuzlarla)
- Proje dosyası (.json) kaydet / aç; dosyayı tuvale sürükleyip bırakarak da açılır
- Şablonlar: küp, yol, oda, oda köşesi (üzerinden geçilecek açık gri kılavuzlarla) ve boş 1/2 nokta
- İlk kullanımda boş tuvalde tek satırlık ipucu ve 8 adımlık etkileşimli tur (kaçış noktası, ışınlar, mıknatıslı çizgi, şekil / kutu, parça silgisi, gezinme, kaydetme); yardımdan yeniden başlatılır, çizim varsa yedeklenip tur bitince geri gelir
- Paneller solda ince bir şeride daralır: fareyle üstüne gelince açılır, dokunmatikte dokununca açılıp kapanır; istenirse sabitlenir
- Perspektif ızgarası: kaçış noktalarına göre zemin, sol duvar ya da sağ duvar (kareler perspektifte doğru kısalır)
- Referans görsel altlığı: fotoğraf yükle ya da sürükle-bırak; opaklık, sığdır/kapla (çıktılara girmez)
- Türkçe ve İngilizce arayüz; açık, koyu ya da sistem teması (çıktılar her zaman beyaz kâğıtta)
- Kalem basıncı (değişken kalınlık), dokunmatik: tek parmak çizer, iki parmak kaydırır, yakınlaştırır ve döndürür; kalem kullanılınca avuç içi koruması

Klavye kısayolları uygulama içinde `?` ile açılır. `Space` + sürükle görünümü kaydırır, `Alt` basılıyken
mıknatıs geçici kapalıdır (serbest çizim); fare tekerleği kaydırır, `Ctrl` + tekerlek yakınlaştırır
(yardım penceresinden "tekerlek yakınlaştırsın" seçilebilir). Dokunmatikte iki parmakla dokunmak geri alır,
üç parmakla ileri alır. Başlıcaları: `V` seç / düzenle, `B` fırça, `E` silgi,
`S` şekil (tekrar basınca tür değişir), `P` kaçış noktası, `H` kaydır, `M` mıknatıs, `G` kılavuzlar,
`#` kâğıt ızgarası, ok tuşları seçili şekli kaydırır.

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

`npm run build` çıktısı (`dist/`) tamamen statiktir; Cloudflare, Vercel, Netlify veya GitHub Pages'e olduğu gibi
yüklenebilir.

Cloudflare Workers (Git bağlantılı): `wrangler.jsonc` `dist/` klasörünü statik dosya olarak sunar.
Build command `npm run build`, deploy command `npx wrangler deploy`; Node sürümü `.node-version` ile 22'ye sabitlidir.
Paneldeki proje adı `wrangler.jsonc` içindeki `name` ile aynı olmalı. `vite.config.ts` içindeki `base: './'` sayesinde alt dizinde (ör. `kullanici.github.io/perspektive/`)
de çalışır.

## Yapı

```
src/
  main.ts            giriş noktası, bileşenleri birbirine bağlar
  engine/            viewport (döndürme dahil), katmanlar, stroke ve şekil modeli (kutu), stroke kesme, kâğıt ızgarası, belge, geri al (komutlar), render
  perspective/       kaçış noktaları, ışın üretimi, snapping (aday kaynakları), köşe kaçış çizgileri, kutu eşitleme, merkezleme
  tools/             Tool arayüzü, fırça, silgi, şekil, seç / düzenle, kaçış noktası, el
  ui/                araç çubuğu, kenar çubuğu ve paneller (katmanlar dahil), pusula, bildirimler, ilk açılış turu, çıktı diyaloğu, yazdırma görünümü
  i18n/              tr.json, en.json, çeviri yardımcıları
  storage/           otomatik kayıt, tercihler, kayıt biçimi doğrulama
  styles/            tema değişkenleri (açık / koyu), arayüz stilleri
```

Ayrıntılı kapsam ve aşamalar için [PROJECT.md](PROJECT.md).

## Tarayıcı desteği

Hedef: güncel Chrome, Edge, Firefox ve Safari; masaüstünde fare, tablette dokunma ve kalem
(Pointer Events). Şu ana kadar Chromium tabanlı tarayıcıda test edildi (dokunma ve kalem sentetik
olaylarla); Firefox, Safari ve gerçek bir kalem/tablette elle denenmesi gerekiyor.
