# Perspektif — UX denetimi (V4 Aşama 1)

Uygulama yeni kullanıcı gözüyle denendi: masaüstü (1280×800, fare/klavye) ve telefon (375×812,
dokunma). Görevler: kaçış noktası koy/taşı, küp çiz, bir çizgiyi sil, kaydet, yazdır. Davranışlar
kodla da doğrulandı. Her bulgunun yanında önerilen çözüm ve V4'teki aşaması var.

Öncelik: **Y** yüksek (görevi engelliyor ya da çoğu kullanıcıyı yanıltıyor), **O** orta (sürtünme),
**D** düşük (cila).

## 1. Bulgular

### Y — yüksek

| # | Bulgu | Kanıt | Öneri | Aşama |
|---|---|---|---|---|
| Y1 | **Telefonda araç çubuğunun üçte ikisi görünmüyor.** Yalnızca araçlar ve geri al sığıyor; temizle, şablon, dosya, dışa aktar, yazdır, kâğıt, yakınlaştırma, tema, dil ve yardım ekran dışında. Yatay kaydırılabildiğine dair bir işaret yok. | 375 px'te çubuk 350 px, içerik 1047 px. | Az kullanılanları tek bir **menü** düğmesinde topla (Dosya: proje, şablon, dışa aktar, yazdır; Görünüm: tema, dil; Yardım). Dar ekranda yakınlaştırma ve kâğıt ayarları da menüye. | 11 |
| Y2 | **Silgi kesişen çizgiyi bütünüyle siliyor.** Küp çizerken bir kenarın fazlasını silmek isteyen kullanıcı tüm çizgiyi kaybediyor. | Varsayılan silgi "bütün çizgi". | Parça silgisi (kesişimden kesişime) varsayılan olur. | 5 |
| Y3 | **Kaçış noktası fırçayla taşınamıyor.** Yeni kullanıcı noktayı tutup sürüklemeye çalışınca çizgi çiziyor; taşımak için önce "kaçış noktası" aracına geçmek gerektiğini bilmiyor. | Fırça işaretçileri yok sayıyor; taşıma yalnızca P aracında. | Fırça, şekil ve seç araçlarında **işaretçinin üstünde imleç "tut" olur ve sürükleme noktayı taşır** (yarıçap ekran pikseli; çizgiye başlamak için işaretçiden biraz uzak durmak yeter). Nokta **ekleme** P aracında kalır. | 2 |
| Y4 | **Sayfa gizli/çok küçük pencerede açılınca kâğıt %5 ölçekte köşede kalıyordu.** | İlk sığdırma 0 boyutlu tuvalde yapılıyordu. | **Düzeltildi** (bu aşamada): tuval gerçek boyuta ulaşınca sığdırılır. | 1 |

### O — orta

| # | Bulgu | Kanıt | Öneri | Aşama |
|---|---|---|---|---|
| O1 | **Space alışkanlığa ters.** Photoshop, Figma, Krita kullanıcıları Space basılıyken sürükleyince **kaydırma** bekler; burada Space geçici serbest çizim. | `main.ts` Space → `temporaryFree`. | Space + sürükle = kaydır. Geçici serbest çizim başka tuşa (öneri: **Alt** basılı tut) — bkz. açık soru A. | 11 |
| O2 | **Dizüstü dokunmatik yüzeyde iki parmak kaydırma yakınlaştırıyor.** Tekerlek her zaman yakınlaştırıyor; trackpad'de sayfayı kaydırmak isteyen kullanıcı hızla zoom yapıyor. | `input.ts` `onWheel` → `zoomAt`. | Ctrl + tekerlek (ve trackpad sıkıştırma) = yakınlaştır; düz tekerlek = kaydır (Shift ile yatay). Tercih olarak "tekerlek yakınlaştırır" seçeneği — bkz. açık soru B. | 11 |
| O3 | **Seçim yokken Delete tüm çizimi temizlemeye kalkıyor.** Onay soruyor ve geri alınabiliyor, ama tasarım araçlarında seçimsiz Delete bir şey yapmaz; şaşırtıcı. | `main.ts` Delete → `clearDrawing()`. | Seçimsiz Delete hiçbir şey yapmasın; temizleme yalnızca çöp kutusu düğmesinden. | 11 |
| O4 | **Hiçbir eylemin geri bildirimi yok.** Geri al / ileri al / silme / kaydet sessiz; kullanıcı ne olduğunu ve geri alınabildiğini görmüyor. | Bildirim bileşeni yok; yalnızca araç çubuğunda küçük "Kaydedildi". | Kısa bildirim (toast): "Çizgi silindi · Geri al", "Geri alındı: …". Ctrl+S'de "Kaydedildi (tarayıcıda)". | 11 |
| O5 | **Dokunmatikte geri al için ekranın üstüne uzanmak gerekiyor.** | İki parmak dokunuşu jesti yok. | İki parmak dokunuş = geri al, üç parmak dokunuş = ileri al (Procreate). | 11 |
| O6 | **Metinler klavye varsayıyor.** İlk kullanım ipucu ve panel açıklamaları telefonda da "S", "Space", "[ ]", "(G)" diyor; ipucu kutusu 375 px'te dar bir sütuna sıkışıp 8 satıra kayıyor. | Ekran görüntüsü (telefon). | Dokunmatik cihazda (`pointer: coarse`) ayrı metinler; kısayol etiketleri gizlenir. İpucu kutusu dar ekranda düğmeleri alt satıra alır. | 11 |
| O7 | **Simgeler etiketsiz ve bazıları belirsiz.** Mıknatıs (kırmızı zeminli "U"), kaçış noktası (yıldız benzeri), proje (klasör) ve dışa aktar (indir) yalnızca üzerine gelince açıklanıyor; dokunmatikte hiç açıklanmıyor. | `title` dışında etiket yok. | Seçili aracın adı kısa süre görünsün (araç değişince küçük etiket/toast) ve menüde metinli öğeler; mıknatıs için daha tanıdık simge. | 11 |
| O8 | **Dokunmatik hedefler küçük.** Araç düğmeleri 32 px (öneri ≥ 44 px), kaçış noktası işaretçisi ~15 px çapında. | Ölçüm. | `pointer: coarse` için büyük düğmeler; nokta tıklama alanı dokunmada ~22 px yarıçap. | 2, 11 |
| O9 | **Kaçış noktası işaretçisi kalabalık.** Işınların toplandığı yerde 11 px'lik halka ince çizgileri örtüyor. | `MARKER_RADIUS = 5.5`, çizgi 2 px. | Varsayılan ~%70 boyut + ayarlanabilir; tıklama alanı küçülmez. | 2 |

### D — düşük

| # | Bulgu | Öneri | Aşama |
|---|---|---|---|
| D1 | Çift tıklama hiçbir şey yapmıyor. | El aracında / boş alanda çift tıklama = sığdır (isteğe bağlı). | 11 |
| D2 | Kâğıdın merkezini bulmanın yolu yok; kaydırınca kâğıt kaybolabiliyor. | "Merkeze git" düğmesi (ölçeği korur). | 2 |
| D3 | Paneller kapalıyken etkin aracın ayarları görünmüyor (araç değişince kısa süre açılıyor). | Bağlamsal seçenek çubuğu (araç çubuğunun altında tek satır: boyut, renk, silgi türü). | 11 |
| D4 | Son kullanılan araç hatırlanmıyor (her açılışta fırça). | Tercihlerde son araç. | 11 |
| D5 | "Proje dosyası" kavramı yeni kullanıcıya yabancı; "Kaydet" arayan otomatik kaydı fark etmiyor. | Menüde "Kaydet (dosyaya)…" / "Aç…" metinleri; ilk kayıtta "Çalışman tarayıcıda otomatik saklanır" bilgisi. | 11 |

## 2. İyi çalışanlar (korunmalı)

- Açılışta çalışmaya hazır sahne: 2 nokta, mıknatıs açık, fırça seçili, ipucu satırı.
- Mıknatıslı çizim ve kilit çizgisinin turuncu vurgusu anlaşılır.
- Otomatik kayıt, uygulama içi onay pencereleri, geri al her işlemde.
- Kenar çubuğunun daraltılması ve araç değişince kısa süre açılması tuvali rahatlattı.
- Kısayollar araç ipuçlarında yazıyor; yardım penceresi eksiksiz.

## 3. Açık sorular (karar gerekiyor)

- **A. Space ne yapsın?** Öneri: Space + sürükle = kaydır (alışkanlık). Geçici serbest çizim **Alt** basılı tutmaya taşınır. Alternatif: Space'i olduğu gibi bırak, kaydırmayı orta tuş/el aracında tut.
- **B. Tekerlek varsayılanı?** Öneri: düz tekerlek = kaydır, Ctrl + tekerlek / sıkıştırma = yakınlaştır (Figma); panelde "Tekerlek yakınlaştırır" seçeneği. Alternatif: bugünkü gibi tekerlek = yakınlaştır.
- **C. Fırçayla kaçış noktası taşıma (Y3)** çizgiye noktanın hemen yanından başlamayı zorlaştırabilir. Öneri: yalnızca işaretçinin tam üstünde (≤ 8 px) tut; daha uzakta çizgi başlar (bugünkü 10 px "noktadan çıkan ışın" davranışı korunur).

## 4. V4 sırasına etkisi

Plan değişmeden yürüyebilir; denetimden çıkan eklemeler:

- **Aşama 2'ye eklenir:** Y3 (her araçta kaçış noktasını sürükleyerek taşıma), O8'in nokta kısmı.
- **Aşama 11'in önceliği (yüksekten düşüğe):** Y1 menü/dar ekran → O1/O2 (açık soru A/B kararıyla) →
  O4 bildirimler → O3 Delete → O5 dokunma jestleri → O6/O7/O8 metin ve hedefler → D maddeleri.
- Y1 telefon kullanılabilirliğini doğrudan etkilediği için istenirse Aşama 2'nin hemen ardından,
  katmanlardan önce yapılabilir.

## 5. Durum (V4 Aşama 11 sonrası)

- **Çözüldü:** Y1 (dar ekranda "⋯" menüsü; El aracı da menüde), Y2 (Aşama 5), Y3 (Aşama 2), Y4 (Aşama 1),
  O1 (Space + sürükle = kaydır, Alt = geçici serbest çizim), O2 (tekerlek kaydırır, Ctrl + tekerlek / sıkıştırma
  yakınlaştırır; yardımda "tekerlek yakınlaştırsın" tercihi), O3 (seçimsiz Delete bir şey yapmaz), O4 (geri al /
  ileri al / silme / temizleme / Ctrl+S bildirimleri, silmede "Geri al"), O5 (iki / üç parmakla dokunma),
  O6 (dokunmatikte ipucu metni; dar ekranda ipucu düğmeleri alt satırda), O8 (dokunmatikte 36 px düğme, nokta
  isabeti 22 px), O9 (Aşama 2), D1 (El aracında çift tıklama = sığdır), D2 (Aşama 2), D4 (son araç hatırlanır).
- **Kısmen:** O7 (araç değişince paneli kısa süre açılıyor; simgeler hâlâ etiketsiz, mıknatıs simgesi aynı).
- **Ertelendi:** D3 (bağlamsal seçenek çubuğu; panelin kısa süre açılması bu ihtiyacı büyük ölçüde karşılıyor),
  D5 ("Kaydet" metinleri; menüde dosya işlemleri simgeli).
