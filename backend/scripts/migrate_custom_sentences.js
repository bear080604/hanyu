#!/usr/bin/env node
/**
 * Generate SQL migration to add example, example_pinyin, example_meaning
 * to custom_deck_words and populate all 7 cloud decks (Bài 4, 5, 6, 7, 8, 9, 9/10).
 */

const fs = require('fs');
const path = require('path');

const decksPath = path.join(__dirname, '../../cloud_decks_backup.json');
const hsk1Path = path.join(__dirname, '../../data/data_hsk1.json');
const hsk2Path = path.join(__dirname, '../../data/data_hsk2.json');

const decks = JSON.parse(fs.readFileSync(decksPath, 'utf8'));
const hsk1 = JSON.parse(fs.readFileSync(hsk1Path, 'utf8'));
const hsk2 = JSON.parse(fs.readFileSync(hsk2Path, 'utf8'));

// Build map from HSK 1 & 2
const hskMap = new Map();
for (const item of [...hsk1, ...hsk2]) {
  const words = item.word.split('|').map(s => s.trim());
  const m0 = (item.meanings || [])[0] || {};
  if (m0.example) {
    for (const w of words) {
      if (!hskMap.has(w) && m0.example.includes(w)) {
        hskMap.set(w, {
          ex: m0.example.trim(),
          exp: (m0.example_pinyin || '').replace(/\//g, '').trim(),
          exm: (m0.example_meaning || '').trim(),
        });
      }
    }
  }
}

// Curated textbook sentences for Hán Ngữ 1 (Bài 4 -> Bài 10) & missing words
const curated = {
  '苹果': {
    ex: '苹果一斤多少钱？',
    exp: 'Píngguǒ yì jīn duōshao qián?',
    exm: 'Táo bao nhiêu tiền một cân?'
  },
  '橘子': {
    ex: '这些橘子很甜。',
    exp: 'Zhèxiē júzi hěn tián.',
    exm: 'Những quả quýt này rất ngọt.'
  },
  '香蕉': {
    ex: '我想买两斤香蕉。',
    exp: 'Wǒ xiǎng mǎi liǎng jīn xiāngjiāo.',
    exm: 'Tôi muốn mua hai cân chuối.'
  },
  '葡萄': {
    ex: '妈妈买了一斤葡萄。',
    exp: 'Māma mǎi le yì jīn pútao.',
    exm: 'Mẹ đã mua một cân nho.'
  },
  '西瓜': {
    ex: '夏天我喜欢吃西瓜。',
    exp: 'Xiàtiān wǒ xǐhuan chī xīguā.',
    exm: 'Mùa hè tôi thích ăn dưa hấu.'
  },
  '梨': {
    ex: '这个梨很大也很甜。',
    exp: 'Zhège lí hěn dà yě hěn tián.',
    exm: 'Quả lê này rất to và cũng rất ngọt.'
  },
  '营业员': {
    ex: '营业员正在数钱。',
    exp: 'Yíngyèyuán zhèngzài shǔ qián.',
    exm: 'Nhân viên giao dịch đang đếm tiền.'
  },
  '人民币': {
    ex: '我要换五百块人民币。',
    exp: 'Wǒ yào huàn wǔbǎi kuài rénmínbì.',
    exm: 'Tôi muốn đổi năm trăm tệ Nhân dân tệ.'
  },
  '港币': {
    ex: '请问今天港币怎么换？',
    exp: 'Qǐngwèn jīntiān gǎngbì zěnme huàn?',
    exm: 'Xin hỏi hôm nay đô la Hồng Kông đổi thế nào?'
  },
  '越南盾': {
    ex: '我想把美元换成越南盾。',
    exp: 'Wǒ xiǎng bǎ měiyuán huàn chéng yuènándùn.',
    exm: 'Tôi muốn đổi đô la Mỹ sang đồng Việt Nam.'
  },
  '食堂': {
    ex: '中午我们去学校食堂吃饭。',
    exp: 'Zhōngwǔ wǒmen qù xuéxiào shítáng chīfàn.',
    exm: 'Buổi trưa chúng tôi đến nhà ăn trường ăn cơm.'
  },
  '馒头': {
    ex: '我要两个馒头和一碗汤。',
    exp: 'Wǒ yào liǎng gè mántou hé yì wǎn tāng.',
    exm: 'Tôi lấy hai cái màn thầu và một bát canh.'
  },
  '要': {
    ex: '你要吃米饭还是面条儿？',
    exp: 'Nǐ yào chī mǐfàn háishi miàntiáor?',
    exm: 'Bạn muốn ăn cơm trắng hay là mì sợi?'
  },
  '汤': {
    ex: '这碗鸡蛋汤很好喝。',
    exp: 'Zhè wǎn jīdàn tāng hěn hǎohē.',
    exm: 'Bát canh trứng gà này rất ngon.'
  },
  '啤酒': {
    ex: '爸爸喝了一瓶啤酒。',
    exp: 'Bàba hē le yì píng píjiǔ.',
    exm: 'Bố đã uống một chai bia.'
  },
  '些': {
    ex: '我买了一些水果。',
    exp: 'Wǒ mǎi le yìxiē shuǐguǒ.',
    exm: 'Tôi đã mua một ít hoa quả.'
  },
  '玛丽': {
    ex: '玛丽是我的好朋友。',
    exp: 'Mǎlì shì wǒ de hǎo péngyou.',
    exm: 'Mary là bạn tốt của tôi.'
  },
  '餐厅': {
    ex: '这家餐厅的菜很好吃。',
    exp: 'Zhè jiā cāntīng de cài hěn hǎochī.',
    exm: 'Món ăn của nhà hàng này rất ngon.'
  },
  '可乐': {
    ex: '我想要一听冰可乐。',
    exp: 'Wǒ xiǎng yào yì tīng bīng kělè.',
    exm: 'Tôi muốn lấy một lon Coca-Cola lạnh.'
  },
  '奶茶': {
    ex: '她下午喜欢喝一杯奶茶。',
    exp: 'Tā xiàwǔ xǐhuan hē yì bēi nǎichá.',
    exm: 'Buổi chiều cô ấy thích uống một cốc trà sữa.'
  },
  '贵姓': {
    ex: '请问您贵姓？',
    exp: 'Qǐngwèn nín guìxìng?',
    exm: 'Xin hỏi quý danh của ngài là gì?'
  },
  '发音': {
    ex: '汉字的发音不太难。',
    exp: 'Hànzì de fāyīn bú tài nán.',
    exm: 'Phát âm của chữ Hán không khó lắm.'
  },
  '杂志': {
    ex: '这是一本中文杂志。',
    exp: 'Zhè shì yì běn Zhōngwén zázhì.',
    exm: 'Đây là một cuốn tạp chí tiếng Trung.'
  },
  '文': {
    ex: '他在大学学习中文。',
    exp: 'Tā zài dàxué xuéxí Zhōngwén.',
    exm: 'Anh ấy học tiếng Trung ở trường đại học.'
  },
  '法文': {
    ex: '这是一本法文词典。',
    exp: 'Zhè shì yì běn Fǎwén cídiǎn.',
    exm: 'Đây là một cuốn từ điển tiếng Pháp.'
  },
  '俄文': {
    ex: '我哥哥会说俄文。',
    exp: 'Wǒ gēge huì shuō Éwén.',
    exm: 'Anh trai tôi biết nói tiếng Nga.'
  },
  '德文': {
    ex: '那本德文书是谁的？',
    exp: 'Nà běn Déwén shū shì shéi de?',
    exm: 'Cuốn sách tiếng Đức kia là của ai?'
  },
  '日文': {
    ex: '我的朋友正在学习日文。',
    exp: 'Wǒ de péngyou zhèngzài xuéxí Rìwén.',
    exm: 'Bạn của tôi đang học tiếng Nhật.'
  },
  '韩文': {
    ex: '她觉得韩文很有意思。',
    exp: 'Tā juéde Hánwén hěn yǒu yìsi.',
    exm: 'Cô ấy cảm thấy tiếng Hàn rất thú vị.'
  },
  '西班牙文': {
    ex: '老师会说西班牙文。',
    exp: 'Lǎoshī huì shuō Xībānyáwén.',
    exm: 'Thầy giáo biết nói tiếng Tây Ban Nha.'
  },
  '阿拉伯文': {
    ex: '阿拉伯文很难写。',
    exp: 'Ālābówén hěn nán xiě.',
    exm: 'Tiếng Ả Rập rất khó viết.'
  },
  '空调': {
    ex: '今天很热，请打开空调。',
    exp: 'Jīntiān hěn rè, qǐng dǎkāi kōngtiáo.',
    exm: 'Hôm nay rất nóng, xin hãy bật máy điều hòa.'
  },
  '客气': {
    ex: '你太客气了，请坐吧。',
    exp: 'Nǐ tài kèqi le, qǐng zuò ba.',
    exm: 'Bạn khách sáo quá rồi, mời ngồi nhé.'
  },
  '身': {
    ex: '祝您身体健康！',
    exp: 'Zhù nín shēntǐ jiànkāng!',
    exm: 'Chúc ngài dồi dào sức khỏe!'
  },
  '男老师': {
    ex: '那位男老师教我们汉语。',
    exp: 'Nà wèi nán lǎoshī jiāo wǒmen Hànyǔ.',
    exm: 'Thầy giáo kia dạy chúng tôi tiếng Hán.'
  },
  '女老师': {
    ex: '这位女老师工作很认真。',
    exp: 'Zhè wèi nǚ lǎoshī gōngzuò hěn rènzhēn.',
    exm: 'Cô giáo này làm việc rất nghiêm túc.'
  },
  '果汁': {
    ex: '我想喝一杯新鲜的果汁。',
    exp: 'Wǒ xiǎng hē yì bēi xīnxiān de guǒzhī.',
    exm: 'Tôi muốn uống một cốc nước ép trái cây tươi.'
  },
  '热闹': {
    ex: '今天学校里非常热闹。',
    exp: 'Jīntiān xuéxiào lǐ fēicháng rènao.',
    exm: 'Hôm nay trong trường vô cùng náo nhiệt.'
  },
  '刷牙': {
    ex: '我每天早上都刷牙。',
    exp: 'Wǒ měitiān zǎoshang dōu shuā yá.',
    exm: 'Tôi mỗi buổi sáng đều đánh răng.'
  },
  '牙刷': {
    ex: '我去商店买了一把牙刷。',
    exp: 'Wǒ qù shāngdiàn mǎi le yì bǎ yáshuā.',
    exm: 'Tôi đi cửa hàng mua một chiếc bàn chải đánh răng.'
  },
  '事故': {
    ex: '路上发生了一起交通事故。',
    exp: 'Lùshang fāshēng le yì qǐ jiāotōng shìgù.',
    exm: 'Trên đường đã xảy ra một vụ tai nạn giao thông.'
  },
  '奶牛': {
    ex: '农场里有很多奶牛。',
    exp: 'Nóngchǎng lǐ yǒu hěn duō nǎiniú.',
    exm: 'Trong nông trại có rất nhiều bò sữa.'
  },
  '蜜蜂': {
    ex: '花园里有一只小蜜蜂。',
    exp: 'Huāyuán lǐ yǒu yì zhī xiǎo mìfēng.',
    exm: 'Trong vườn hoa có một chú ong nhỏ.'
  },
  '蜂蜜': {
    ex: '妈妈喜欢喝蜂蜜水。',
    exp: 'Māma xǐhuan hē fēngmì shuǐ.',
    exm: 'Mẹ thích uống nước mật ong.'
  },
  '秘书': {
    ex: '王秘书先给我们介绍一下儿。',
    exp: 'Wáng mìshū xiān gěi wǒmen jièshào yíxiàr.',
    exm: 'Thư ký Vương giới thiệu cho chúng tôi một chút trước.'
  },
  '教授': {
    ex: '这位是北京大学的王教授。',
    exp: 'Zhè wèi shì Běijīng Dàxué de Wáng jiàoshòu.',
    exm: 'Vị này là Giáo sư Vương của Đại học Bắc Kinh.'
  },
  '留学': {
    ex: '我想明年去中国留学。',
    exp: 'Wǒ xiǎng míngnián qù Zhōngguó liúxué.',
    exm: 'Tôi muốn năm sau đi Trung Quốc du học.'
  },
  '俩': {
    ex: '我们俩都是留学生。',
    exp: 'Wǒmen liǎ dōu shì liúxuéshēng.',
    exm: 'Hai chúng tôi đều là du học sinh.'
  },
  // Textbook overrides for specific senses in Bài 4, 5, 6, 7, 8, 9, 10
  '块': {
    ex: '苹果三块钱一斤。',
    exp: 'Píngguǒ sān kuài qián yì jīn.',
    exm: 'Táo ba tệ một cân.'
  },
  '角': {
    ex: '这支笔五元五角。',
    exp: 'Zhè zhī bǐ wǔ yuán wǔ jiǎo.',
    exm: 'Cây bút này năm tệ năm hào.'
  },
  '毛': {
    ex: '橘子两块五毛一斤。',
    exp: 'Júzi liǎng kuài wǔ máo yì jīn.',
    exm: 'Quýt hai tệ năm hào một cân.'
  },
  '分': {
    ex: '找您五毛五分钱。',
    exp: 'Zhǎo nín wǔ máo wǔ fēn qián.',
    exm: 'Trả lại ngài năm hào năm xu tiền thừa.'
  },
  '换': {
    ex: '我要去银行换人民币。',
    exp: 'Wǒ yào qù yínháng huàn rénmínbì.',
    exm: 'Tôi muốn đi ngân hàng đổi Nhân dân tệ.'
  },
  '饭': {
    ex: '我还没吃晚饭呢。',
    exp: 'Wǒ hái méi chī wǎnfàn ne.',
    exm: 'Tôi vẫn chưa ăn cơm tối.'
  },
  '米': {
    ex: '我想买两公斤大米。',
    exp: 'Wǒ xiǎng mǎi liǎng gōngjīn dàmǐ.',
    exm: 'Tôi muốn mua hai cân gạo.'
  },
  '杯': {
    ex: '请给我来一杯热茶。',
    exp: 'Qǐng gěi wǒ lái yì bēi rè chá.',
    exm: 'Xin cho tôi một cốc trà nóng.'
  },
  '不客气': {
    ex: '大家都是好朋友，不客气！',
    exp: 'Dàjiā dōu shì hǎo péngyou, bú kèqi!',
    exm: 'Mọi người đều là bạn tốt, đừng khách sáo!'
  },
  '日': {
    ex: '今天是十月十日。',
    exp: 'Jīntiān shì shí yuè shí rì.',
    exm: 'Hôm nay là ngày mười tháng mười.'
  },
  '进': {
    ex: '王老师，请进屋里坐！',
    exp: 'Wáng lǎoshī, qǐng jìn wū lǐ zuò!',
    exm: 'Thầy Vương, xin mời vào phòng ngồi!'
  },
  '听': {
    ex: '请给我来两听可乐。',
    exp: 'Qǐng gěi wǒ lái liǎng tīng kělè.',
    exm: 'Xin lấy cho tôi hai lon Coca-Cola.'
  },
  '来': {
    ex: '老板，来一碗牛肉面条儿。',
    exp: 'Lǎobǎn, lái yì wǎn niúròu miàntiáor.',
    exm: 'Ông chủ, cho một bát mì thịt bò.'
  },
  '找': {
    ex: '给您十块，找您两块钱。',
    exp: 'Gěi nín shí kuài, zhǎo nín liǎng kuài qián.',
    exm: 'Đưa ngài mười tệ, trả lại ngài hai tệ tiền thừa.'
  },
  '数': {
    ex: '请您数一数，一共是一千块。',
    exp: 'Qǐng nín shǔ yi shǔ, yígòng shì yìqiān kuài.',
    exm: 'Xin ngài đếm thử xem, tổng cộng là một nghìn tệ.'
  }
};

function esc(str) {
  if (!str) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

const sql = [];
sql.push('-- Migration: Add example columns to custom_deck_words and populate existing cloud decks');

for (const [id, deck] of Object.entries(decks)) {
  sql.push(`\n-- Deck ${id}: ${deck.name}`);
  for (const w of deck.words) {
    const info = curated[w.h] || hskMap.get(w.h);
    if (!info) {
      console.error('MISSING:', w.h);
      continue;
    }
    sql.push(
      `UPDATE custom_deck_words SET example = ${esc(info.ex)}, example_pinyin = ${esc(info.exp)}, example_meaning = ${esc(info.exm)} WHERE deck_id = ${Number(id)} AND hanzi = ${esc(w.h)};`
    );
  }
}

const outPath = path.join(__dirname, '../migrate_custom_deck_sentences.sql');
fs.writeFileSync(outPath, sql.join('\n') + '\n', 'utf8');
console.log('✅ Generated:', outPath, 'with', sql.length, 'lines');

// Also build WQ_SENTENCE_BANK and append to data/data.js if not already present
const bank = {};
for (const [id, deck] of Object.entries(decks)) {
  for (const w of deck.words) {
    const info = curated[w.h] || hskMap.get(w.h);
    if (info) {
      bank[w.h] = {
        ex: (info.ex || '').split('\n')[0].trim(),
        exp: (info.exp || '').split('\n')[0].trim(),
        exm: (info.exm || '').split('\n')[0].trim()
      };
    }
  }
}

const dataJsPath = path.join(__dirname, '../../data/data.js');
let dataJs = fs.readFileSync(dataJsPath, 'utf8');
const marker = '// ==================== WQ_SENTENCE_BANK ====================';
if (dataJs.includes(marker)) {
  dataJs = dataJs.split(marker)[0].trimEnd() + '\n\n';
}
dataJs += `\n${marker}\nwindow.WQ_SENTENCE_BANK = ${JSON.stringify(bank, null, 2)};\n`;
fs.writeFileSync(dataJsPath, dataJs, 'utf8');
console.log('✅ Appended WQ_SENTENCE_BANK (' + Object.keys(bank).length + ' words) to data/data.js');

