# فيديو كافيه محاكى لاختبار رحلة العميل

هذا المجلد يصنع فيديو كافيه ثلاثي الأبعاد من زاوية كاميرا مراقبة، ومعه **ملف الأوقات الصحيحة** لكل عميل، عشان نقيس دقة `journey.py` بأرقام بدل التقدير بالعين. الفيديو للاختبار فقط، وشكله مو واقعي مثل كاميرا حقيقية، فالأرقام هنا تقيس المنطق (الطابور، الاستلام، الطاولات، التأخير) أكثر من قوة الموديل على صور حقيقية.

## المحتوى

| الملف | وش هو |
|---|---|
| `sim.js` | منطق الكافيه: وصول العملاء، الطابور، الكاشير، الباريستا، الويتر، الطاولات. نفس الـ seed يطلع نفس اليوم بالضبط |
| `scene.html` | المشهد ثلاثي الأبعاد (three.js) والكاميرا والمناطق |
| `render.cjs` | يصوّر المشهد إطار إطار في Chromium ويطلع mp4 |
| `truth.mjs` | يطلع ملف الأوقات الصحيحة بدون تصوير |
| `cafe_sim_truth.json` | الأوقات الصحيحة للفيديو الجاهز (seed 17، 20 دقيقة، 10 إطارات بالثانية) |
| `cafe_sim_zones.json` | مناطق الطابور والاستلام والطاولات والباب والموظفين لنفس زاوية الكاميرا |
| `evaluate_journeys.py` | يقارن نتيجة `journey.py` مع الأوقات الصحيحة |

## الفيديو الجاهز

`cafe_sim_20min.mp4` (‏1280×720، ‏10 إطارات بالثانية، 20 دقيقة) محفوظ في ملفات المشروع لأنه كبير على GitHub. فيه 47 عميل:
سفري، يستلم من الكاونتر ويجلس، يجلس ويجيه الويتر بالطلب، واحد يطلع من الطابور بدون ما يطلب، و4 طلبات «منسية» تتأخر أكثر من 8 دقائق.

## القياس

```bash
cd analysis
python journey.py --video cafe_sim_20min.mp4 --zones sim/cafe_sim_zones.json --model rfdetr
python sim/evaluate_journeys.py --truth sim/cafe_sim_truth.json --results output/cafe_sim_20min_journeys.json
```

## تعريف الأوقات في ملف الحقيقة

- `tEnter`: يعدّي خط الباب داخل الكافيه
- `tQueue`: يوصل آخر الطابور
- `tOrder`: يخلص طلبه ويبعد عن الكاشير
- `tServed`: سفري أو استلام: ياخذ الكوب من الكاونتر. طاولة: الويتر يحط الكوب على الطاولة
- `tSeated`: يجلس، و`table` رقم الطاولة بنفس ترتيب `cafe_sim_zones.json`
- `tExit`: يعدّي خط الباب وهو طالع (`null` إذا كان باقي داخل لما خلص الفيديو)
- `late`: من الدخول للاستلام 8 دقائق أو أكثر (أو ما استلم وصار له 8 دقائق)

## تصوير فيديو جديد

يحتاج Node و Playwright و ffmpeg، وموديلات الأشخاص من أمثلة three.js (Soldier و Michelle و Xbot، من مكتبة Mixamo):

```bash
cd analysis/sim
npm i three@0.160.0 playwright
mkdir models && for m in Soldier Michelle Xbot; do curl -sLo models/$m.glb https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/$m.glb; done
python3 -m http.server 8765 &
node render.cjs "aa=0&seed=17" 10 0 1200 cafe_sim.mp4      # يقدر يتقسم على أكثر من جهاز/عملية: 0 400، 400 800 ...
node truth.mjs 10 1200 17 cafe_sim_zones.json cafe_sim.mp4 cafe_sim_truth.json
```

غيّري `seed` عشان يوم مختلف، و`dur` للمدة. التصوير على معالج بدون كرت شاشة ياخذ تقريباً نص ثانية إلى ثانية لكل إطار.
