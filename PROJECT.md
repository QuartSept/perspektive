# Perspektif Çizim Uygulaması

## Amaç
Yeni başlayanlar ve amatörler için web tabanlı, minimalist bir perspektif çizim aracı. Kullanıcı kaçış noktalarını istediği yere koyar, bu noktalardan çıkan ince hayalet kılavuz ışınlarını görür, fırça bu ışınlara mıknatıs gibi kilitlenerek kusursuz perspektif çizgileri çizer. İstenirse serbest moda geçilir. Çalışma dijital olarak kaydedilir veya yazdırılıp fiziksel kâğıda dökülür.

## Hedef platform
Masaüstü, fare öncelikli. Dokunmatik/kalem desteği sonraki sürümlere bırakılır, ancak girdi katmanı Pointer Events ile yazılır ki ileride kolayca eklenebilsin.

## Kapsam (MVP)
1. Boş tuval (A4, A5, kare, ekran boyu); sonsuz kaydırma ve yakınlaştırma.
2. 1 ve 2 nokta perspektif (3 nokta v2).
3. Kaçış noktası ekle / taşı / sil; tuval dışına da konabilir.
4. Hayalet ışınlar: noktadan çıkan ince, düşük opaklıklı çizgiler; ışın sayısı kaydırıcıyla ayarlanır (12–72); fare bir noktaya yaklaşınca o noktanın ışınları belirginleşir, diğerleri silikleşir.
5. Mıknatıs (snapping) modu: stroke başında en yakın ışına kilitlenir; ilk birkaç pikselde fare hareketinin yönüne göre hangi kaçış noktasının ışını seçileceği belirlenir; ayarlanabilir mıknatıs yarıçapı; kilit alınınca seçili ışın kalınlaşır ve renk değiştirir; yarıçap dışına çıkılınca kilit bırakılır.
6. Serbest mod: Space basılı tutulunca geçici, ayrıca kalıcı aç/kapat düğmesi; hafif stroke yumuşatma (smoothing).
7. Araçlar: fırça (kalınlık + opaklık), stroke silgisi (dokunulan çizgiyi komple siler), geri al/ileri al, kılavuzları göster/gizle, yakınlaştır/kaydır.
8. Ufuk çizgisi: 2 noktada varsayılan olarak kilitli, kullanıcı "ufku serbest bırak" ile açabilir.
9. Dışa aktarma: PNG.
10. Yazdırma: iki seçenek — "yalnızca çizimim" ve "kılavuzlarla birlikte"; A4 doğru ölçek ve kenar boşlukları (`@media print` / ayrı yazdırma görünümü).
11. Otomatik kayıt: IndexedDB veya localStorage; hesap ve sunucu yok.
12. Arayüz dili: Türkçe + İngilizce; i18n baştan kurulur, metinler dil dosyalarında durur.
13. Renkler: siyah, gri tonları ve 3–4 hazır renk (renk seçici yok).

## Kapsam dışı (şimdilik)
- Şablonlu çalışma kâğıtları (küp, yol, oda köşesi vb.)
- SVG dışa aktarma
- 3 nokta perspektif
- Renk seçici
- Piksel silgisi (stroke'u parçalara bölerek kısmi silme; v2)
- Dokunmatik/kalem ve basınç desteği
- Koyu tema
- Hesap / bulut kaydı

## Teknik yığın
- **Vite + TypeScript, çerçevesiz (vanilla).** Arayüz küçük olduğu için React/Svelte gerekmiyor; çizim motoru çerçeveden bağımsız yazılır, ileride arayüz taşınabilir.
- **HTML Canvas.** Çizimler vektör stroke listesi olarak saklanır ve yeniden çizilir (geri al ve ileride SVG çıktısı için).
- **Katmanlar:** (1) kâğıt/tuval, (2) çizim, (3) kılavuz ışınları, (4) etkileşim/önizleme.
- **Girdi:** Pointer Events.
- **Stroke modeli:** her stroke bir nokta dizisi + stil bilgisi (kalınlık, opaklık). Geri al/ileri al komut tabanlıdır (Command pattern); komutlar genel tutulur ki ileride piksel silgisi "bir stroke'u N parçayla değiştir" komutu olarak eklenebilsin.
- **Silgi:** bir arayüz (Tool) arkasında. MVP'de `StrokeEraser`, v2'de aynı arayüzle `PixelEraser`. Araç çubuğunda silgi tek düğme; v2'de içine tür seçimi (stroke/piksel) eklenir.
- **i18n:** basit modül (`tr.json`, `en.json`), varsayılan dil tarayıcı dilinden.
- **Tema:** tüm renkler CSS değişkenleriyle. Açık, kâğıt hissi veren tema varsayılan; koyu tema sonradan ayrı bir değişken setiyle eklenecek.
- **Barındırma:** tamamen statik site (Vercel, Netlify veya GitHub Pages).

## Klavye kısayolları
| Kısayol | İşlev |
|---|---|
| Space (basılı) | Geçici serbest mod |
| Ctrl+Z / Ctrl+Shift+Z | Geri al / ileri al |
| `[` `]` | Fırça boyutu |
| G | Kılavuzları göster/gizle |
| M | Mıknatıs aç/kapat |

## Önerilen dosya yapısı
```
src/
  main.ts            giriş noktası
  engine/            viewport, stroke modeli, render, geri al (komutlar)
  perspective/       kaçış noktaları, ışın üretimi, snapping mantığı
  tools/             Tool arayüzü, fırça, StrokeEraser, nokta yerleştirme
  ui/                araç çubuğu, paneller, dışa aktarma/yazdırma diyalogları
  i18n/              tr.json, en.json, çeviri yardımcıları
  storage/           otomatik kayıt
  styles/            tema değişkenleri, açık tema
index.html
```

## Aşamalar
1. **İskelet:** Vite+TS kurulumu, canvas, viewport (kaydır/yakınlaştır), açık tema, CSS değişkenleri.
2. **Kaçış noktaları ve hayalet ışınlar:** 1 ve 2 nokta, ufuk kilidi, ışın sayısı kaydırıcısı, yakınlıkta belirginleşme.
3. **Fırça + stroke modeli + geri al/ileri al** (komut tabanlı yapı burada kurulur).
4. **Snapping:** ışına kilitlenme, yön ile nokta seçimi, yarıçap, görsel geri bildirim, serbest mod geçişi.
5. **Stroke silgisi**, stroke yumuşatma, klavye kısayolları. (Piksel silgisi v2: stroke bölme komutu + yarıçaplı silgi önizlemesi.)
6. **Otomatik kayıt.**
7. **PNG dışa aktarma ve yazdırma görünümü** (iki yazdırma seçeneği, A4 ölçek).
8. **i18n (TR/EN)** ve son cilalama, erişilebilirlik, tarayıcı testleri.

## Notlar
- Snapping en riskli kısımdır; kaçış noktaları ve stroke modeli oturmadan başlanmamalı.
- Her aşama sonunda çalışır durumda bir sürüm olmalı; aşamalar atlanmadan sırayla ilerlenmeli.
- Metinler koda gömülmez; her kullanıcıya görünen metin i18n anahtarı üzerinden gelir.
