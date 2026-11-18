// ==================== SENTENCE.JS — Sentence Arrange & Fill-in-Blank ====================
// Runs on sentence.html. Requires js/shared.js to be loaded first.

var sMode = localStorage.getItem('wq_sentence_mode') || 'arrange'; // 'arrange' | 'fill' | 'mix'
var sActiveSubMode = 'arrange'; // actual mode for current question ('arrange' or 'fill')
var sPool = [];
var sAsked = [];
var sCur = null;
var sAnswered = false;
var sScore = 0;
var sTotal = 0;

// Arrange mode state
var sTargetTokens = [];
var sEndPunct = '。';
var sBankItems = [];   // [{ id, text, used }]
var sAnswerItems = []; // [{ id, text }]

// Fill mode state
var sFillOptions = [];
var sTargetMatch = '';
var sLastSentenceByWord = {}; // tracks last shown sentence per word so repeats pick a different random sentence

// ==================== WORD DICTIONARY & TOOLTIP SYSTEM ====================
var _EXTRA_WORD_DICT = {
  // Đại từ & từ để hỏi
  '我': { p: 'wǒ', m: 'tôi, mình' },
  '你': { p: 'nǐ', m: 'bạn, anh, chị' },
  '您': { p: 'nín', m: 'ngài, ông, bà (kính trọng)' },
  '他': { p: 'tā', m: 'anh ấy, ông ấy' },
  '她': { p: 'tā', m: 'cô ấy, bà ấy' },
  '它': { p: 'tā', m: 'nó' },
  '我们': { p: 'wǒmen', m: 'chúng tôi, chúng ta' },
  '你们': { p: 'nǐmen', m: 'các bạn' },
  '他们': { p: 'tāmen', m: 'họ, bọn họ' },
  '她们': { p: 'tāmen', m: 'họ (nữ)' },
  '大家': { p: 'dàjiā', m: 'mọi người' },
  '自己': { p: 'zìjǐ', m: 'tự mình, bản thân' },
  '别人': { p: 'biérén', m: 'người khác' },
  '别的': { p: 'biéde', m: 'khác, cái khác' },
  '谁': { p: 'shéi', m: 'ai' },
  '这': { p: 'zhè', m: 'này, đây' },
  '那': { p: 'nà', m: 'kia, đó' },
  '这个': { p: 'zhège', m: 'cái này' },
  '那个': { p: 'nàge', m: 'cái kia' },
  '这些': { p: 'zhèxiē', m: 'những cái này' },
  '那些': { p: 'nàxiē', m: 'những cái kia' },
  '这儿': { p: 'zhèr', m: 'ở đây, chỗ này' },
  '那儿': { p: 'nàr', m: 'ở đó, chỗ kia' },
  '这里': { p: 'zhèlǐ', m: 'ở đây, nơi này' },
  '那里': { p: 'nàlǐ', m: 'ở đó, nơi kia' },
  '哪': { p: 'nǎ', m: 'nào' },
  '哪儿': { p: 'nǎr', m: 'ở đâu' },
  '哪里': { p: 'nǎlǐ', m: 'ở đâu' },
  '什么': { p: 'shénme', m: 'cái gì, gì' },
  '怎么': { p: 'zěnme', m: 'như thế nào, sao' },
  '怎么样': { p: 'zěnmeyàng', m: 'như thế nào' },
  '多少': { p: 'duōshao', m: 'bao nhiêu' },
  '几': { p: 'jǐ', m: 'mấy, vài' },
  '为什么': { p: 'wèishénme', m: 'tại sao' },
  // Số từ & đại lượng
  '零': { p: 'líng', m: 'số 0, lẻ' },
  '一': { p: 'yī', m: 'một' },
  '二': { p: 'èr', m: 'hai (số đếm)' },
  '两': { p: 'liǎng', m: 'hai (đi với lượng từ)' },
  '三': { p: 'sān', m: 'ba' },
  '四': { p: 'sì', m: 'bốn' },
  '五': { p: 'wǔ', m: 'năm' },
  '六': { p: 'liù', m: 'sáu' },
  '七': { p: 'qī', m: 'bảy' },
  '八': { p: 'bā', m: 'tám' },
  '九': { p: 'jiǔ', m: 'chín' },
  '十': { p: 'shí', m: 'mười' },
  '百': { p: 'bǎi', m: 'trăm' },
  '千': { p: 'qiān', m: 'nghìn' },
  '万': { p: 'wàn', m: 'vạn (mười nghìn)' },
  '半': { p: 'bàn', m: 'một nửa, rưỡi' },
  '第': { p: 'dì', m: 'thứ (số thứ tự)' },
  '俩': { p: 'liǎ', m: 'hai người' },
  '我们俩': { p: 'wǒmen liǎ', m: 'hai chúng tôi' },
  '些': { p: 'xiē', m: 'một vài, những' },
  '一些': { p: 'yìxiē', m: 'một ít, một số' },
  '一点儿': { p: 'yìdiǎnr', m: 'một chút, một ít' },
  '一点': { p: 'yìdiǎn', m: 'một chút' },
  '一下': { p: 'yíxià', m: 'một lát, một chút' },
  '一下儿': { p: 'yíxiàr', m: 'một lát, một chút' },
  '一起': { p: 'yìqǐ', m: 'cùng nhau' },
  '一共': { p: 'yígòng', m: 'tổng cộng' },
  // Lượng từ & tiền tệ
  '个': { p: 'gè', m: 'cái, chiếc, người (lượng từ)' },
  '位': { p: 'wèi', m: 'vị (lượng từ kính trọng)' },
  '本': { p: 'běn', m: 'quyển, cuốn (sách)' },
  '件': { p: 'jiàn', m: 'chiếc, bộ (quần áo), việc' },
  '杯': { p: 'bēi', m: 'cốc, ly, tách' },
  '碗': { p: 'wǎn', m: 'bát, chén' },
  '瓶': { p: 'píng', m: 'chai, lọ' },
  '听': { p: 'tīng', m: 'nghe / lon (nước ngọt)' },
  '斤': { p: 'jīn', m: 'cân (0.5 kg)' },
  '公斤': { p: 'gōngjīn', m: 'ki-lô-gam (kg)' },
  '块': { p: 'kuài', m: 'đồng, tệ / miếng' },
  '元': { p: 'yuán', m: 'đồng, tệ (Nhân dân tệ)' },
  '毛': { p: 'máo', m: 'hào (1/10 tệ)' },
  '角': { p: 'jiǎo', m: 'hào (1/10 tệ)' },
  '分': { p: 'fēn', m: 'xu / phút' },
  '钱': { p: 'qián', m: 'tiền' },
  '多少钱': { p: 'duōshao qián', m: 'bao nhiêu tiền' },
  '张': { p: 'zhāng', m: 'tờ, tấm, chiếc' },
  '把': { p: 'bǎ', m: 'cái, chiếc (ghế, bàn chải, ô) / giới từ' },
  '支': { p: 'zhī', m: 'chiếc, cây (bút)' },
  '条': { p: 'tiáo', m: 'con, chiếc, sợi' },
  '只': { p: 'zhī', m: 'con (động vật), chiếc' },
  '双': { p: 'shuāng', m: 'đôi, cặp' },
  '份': { p: 'fèn', m: 'phần, suất' },
  '岁': { p: 'suì', m: 'tuổi' },
  '次': { p: 'cì', m: 'lần' },
  '人民币': { p: 'rénmínbì', m: 'Nhân dân tệ' },
  '港币': { p: 'gǎngbì', m: 'đô la Hồng Kông' },
  '美元': { p: 'měiyuán', m: 'đô la Mỹ (USD)' },
  '越南盾': { p: 'yuènándùn', m: 'đồng Việt Nam (VNĐ)' },
  // Trợ từ, phó từ, giới từ, liên từ
  '的': { p: 'de', m: 'của (trợ từ sở hữu/định ngữ)' },
  '了': { p: 'le', m: 'đã, rồi (trợ từ)' },
  '吗': { p: 'ma', m: 'không? (trợ từ nghi vấn)' },
  '呢': { p: 'ne', m: 'thế, nhỉ, đang (trợ từ)' },
  '吧': { p: 'ba', m: 'nhé, đi, chắc là (trợ từ)' },
  '啊': { p: 'a', m: 'à, ồ (trợ từ cảm thán)' },
  '着': { p: 'zhe', m: 'đang (trợ từ trạng thái)' },
  '过': { p: 'guò', m: 'đã từng / qua' },
  '得': { p: 'de', m: 'trợ từ bổ ngữ mức độ' },
  '不': { p: 'bù', m: 'không' },
  '没': { p: 'méi', m: 'chưa, không' },
  '没有': { p: 'méiyǒu', m: 'không có, chưa' },
  '别': { p: 'bié', m: 'đừng' },
  '很': { p: 'hěn', m: 'rất' },
  '太': { p: 'tài', m: 'quá, lắm' },
  '非常': { p: 'fēicháng', m: 'vô cùng, rất' },
  '真': { p: 'zhēn', m: 'thật là' },
  '最': { p: 'zuì', m: 'nhất' },
  '更': { p: 'gèng', m: 'càng, hơn' },
  '还': { p: 'hái', m: 'vẫn, còn' },
  '还是': { p: 'háishi', m: 'hay là, vẫn là' },
  '也': { p: 'yě', m: 'cũng' },
  '都': { p: 'dōu', m: 'đều' },
  '就': { p: 'jiù', m: 'thì, ngay, chính' },
  '才': { p: 'cái', m: 'mới, vừa mới' },
  '正在': { p: 'zhèngzài', m: 'đang' },
  '已经': { p: 'yǐjīng', m: 'đã... rồi' },
  '先': { p: 'xiān', m: 'trước, trước tiên' },
  '再': { p: 'zài', m: 'lại, tiếp' },
  '又': { p: 'yòu', m: 'lại' },
  '常': { p: 'cháng', m: 'thường' },
  '常常': { p: 'chángcháng', m: 'thường xuyên' },
  '经常': { p: 'jīngcháng', m: 'thường xuyên' },
  '在': { p: 'zài', m: 'ở, tại / đang' },
  '跟': { p: 'gēn', m: 'cùng, với' },
  '和': { p: 'hé', m: 'và, với' },
  '给': { p: 'gěi', m: 'cho, đưa cho' },
  '对': { p: 'duì', m: 'đúng / đối với' },
  '从': { p: 'cóng', m: 'từ' },
  '到': { p: 'dào', m: 'đến, tới' },
  '离': { p: 'lí', m: 'cách (khoảng cách)' },
  '比': { p: 'bǐ', m: 'so với, hơn' },
  // Động từ thông dụng
  '是': { p: 'shì', m: 'là, đúng' },
  '有': { p: 'yǒu', m: 'có' },
  '去': { p: 'qù', m: 'đi' },
  '来': { p: 'lái', m: 'đến, tới / cho (khi gọi món)' },
  '回': { p: 'huí', m: 'về, quay về' },
  '进': { p: 'jìn', m: 'vào, bước vào' },
  '出': { p: 'chū', m: 'ra, đi ra' },
  '上': { p: 'shàng', m: 'lên, đi học/làm / trên' },
  '下': { p: 'xià', m: 'xuống, tan / dưới' },
  '坐': { p: 'zuò', m: 'ngồi, đi (bằng phương tiện)' },
  '站': { p: 'zhàn', m: 'đứng / trạm, bến' },
  '走': { p: 'zǒu', m: 'đi, bước đi' },
  '跑': { p: 'pǎo', m: 'chạy' },
  '看': { p: 'kàn', m: 'nhìn, xem, đọc' },
  '看书': { p: 'kànshū', m: 'đọc sách' },
  '看见': { p: 'kànjiàn', m: 'nhìn thấy' },
  '听见': { p: 'tīngjiàn', m: 'nghe thấy' },
  '说': { p: 'shuō', m: 'nói' },
  '说话': { p: 'shuōhuà', m: 'nói chuyện' },
  '读': { p: 'dú', m: 'đọc' },
  '写': { p: 'xiě', m: 'viết' },
  '吃': { p: 'chī', m: 'ăn' },
  '吃饭': { p: 'chīfàn', m: 'ăn cơm' },
  '喝': { p: 'hē', m: 'uống' },
  '喝茶': { p: 'hēchá', m: 'uống trà' },
  '喝酒': { p: 'hējiǔ', m: 'uống rượu/bia' },
  '买': { p: 'mǎi', m: 'mua' },
  '卖': { p: 'mài', m: 'bán' },
  '换': { p: 'huàn', m: 'đổi, thay' },
  '换成': { p: 'huàn chéng', m: 'đổi thành, đổi sang' },
  '找': { p: 'zhǎo', m: 'tìm / trả lại tiền thừa' },
  '数': { p: 'shǔ', m: 'đếm' },
  '数钱': { p: 'shǔ qián', m: 'đếm tiền' },
  '数一数': { p: 'shǔ yi shǔ', m: 'đếm thử xem' },
  '要': { p: 'yào', m: 'muốn, cần, lấy' },
  '想': { p: 'xiǎng', m: 'muốn, nghĩ, nhớ' },
  '想要': { p: 'xiǎng yào', m: 'muốn lấy, mong muốn' },
  '会': { p: 'huì', m: 'biết (kỹ năng), sẽ' },
  '能': { p: 'néng', m: 'có thể' },
  '可以': { p: 'kěyǐ', m: 'có thể, được' },
  '喜欢': { p: 'xǐhuan', m: 'thích' },
  '爱': { p: 'ài', m: 'yêu, thích' },
  '觉得': { p: 'juéde', m: 'cảm thấy' },
  '知道': { p: 'zhīdào', m: 'biết' },
  '认识': { p: 'rènshi', m: 'quen biết' },
  '学习': { p: 'xuéxí', m: 'học tập' },
  '学': { p: 'xué', m: 'học' },
  '教': { p: 'jiāo', m: 'dạy' },
  '工作': { p: 'gōngzuò', m: 'làm việc / công việc' },
  '住': { p: 'zhù', m: 'ở, cư trú' },
  '开': { p: 'kāi', m: 'mở, lái (xe)' },
  '打开': { p: 'dǎkāi', m: 'mở ra, bật lên' },
  '关': { p: 'guān', m: 'đóng, tắt' },
  '穿': { p: 'chuān', m: 'mặc, đi (giày)' },
  '洗': { p: 'xǐ', m: 'rửa, giặt' },
  '刷': { p: 'shuā', m: 'chải, đánh' },
  '刷牙': { p: 'shuāyá', m: 'đánh răng' },
  '睡觉': { p: 'shuìjiào', m: 'ngủ' },
  '起床': { p: 'qǐchuáng', m: 'thức dậy' },
  '休息': { p: 'xiūxi', m: 'nghỉ ngơi' },
  '运动': { p: 'yùndòng', m: 'vận động, thể thao' },
  '游泳': { p: 'yóuyǒng', m: 'bơi lội' },
  '玩': { p: 'wán', m: 'chơi' },
  '玩儿': { p: 'wánr', m: 'chơi' },
  '留学': { p: 'liúxué', m: 'du học' },
  '介绍': { p: 'jièshào', m: 'giới thiệu' },
  '祝': { p: 'zhù', m: 'chúc' },
  '请': { p: 'qǐng', m: 'mời, xin' },
  '请问': { p: 'qǐngwèn', m: 'xin hỏi' },
  '问': { p: 'wèn', m: 'hỏi' },
  '回答': { p: 'huídá', m: 'trả lời' },
  '告诉': { p: 'gàosu', m: 'nói cho biết, bảo' },
  '等': { p: 'děng', m: 'đợi, chờ' },
  '帮助': { p: 'bāngzhù', m: 'giúp đỡ' },
  '准备': { p: 'zhǔnbèi', m: 'chuẩn bị' },
  '开始': { p: 'kāishǐ', m: 'bắt đầu' },
  '发生': { p: 'fāshēng', m: 'xảy ra, phát sinh' },
  '担心': { p: 'dānxīn', m: 'lo lắng' },
  '做': { p: 'zuò', m: 'làm, nấu' },
  // Danh từ: Con người, địa điểm, quốc gia, ngôn ngữ
  '人': { p: 'rén', m: 'người' },
  '男': { p: 'nán', m: 'nam' },
  '女': { p: 'nǚ', m: 'nữ' },
  '朋友': { p: 'péngyou', m: 'bạn bè' },
  '好朋友': { p: 'hǎo péngyou', m: 'bạn tốt, bạn thân' },
  '老师': { p: 'lǎoshī', m: 'thầy/cô giáo' },
  '男老师': { p: 'nán lǎoshī', m: 'thầy giáo' },
  '女老师': { p: 'nǚ lǎoshī', m: 'cô giáo' },
  '学生': { p: 'xuésheng', m: 'học sinh, sinh viên' },
  '留学生': { p: 'liúxuéshēng', m: 'du học sinh' },
  '同学': { p: 'tóngxué', m: 'bạn cùng lớp' },
  '先生': { p: 'xiānsheng', m: 'ông, ngài, tiên sinh' },
  '小姐': { p: 'xiǎojiě', m: 'cô, tiểu thư' },
  '爸爸': { p: 'bàba', m: 'bố, ba' },
  '妈妈': { p: 'māma', m: 'mẹ, má' },
  '哥哥': { p: 'gēge', m: 'anh trai' },
  '姐姐': { p: 'jiějie', m: 'chị gái' },
  '弟弟': { p: 'dìdi', m: 'em trai' },
  '妹妹': { p: 'mèimei', m: 'em gái' },
  '儿子': { p: 'érzi', m: 'con trai' },
  '女儿': { p: 'nǚ\'ér', m: 'con gái' },
  '孩子': { p: 'háizi', m: 'con cái, trẻ con' },
  '大夫': { p: 'dàifu', m: 'bác sĩ' },
  '医生': { p: 'yīshēng', m: 'bác sĩ' },
  '营业员': { p: 'yíngyèyuán', m: 'nhân viên giao dịch/bán hàng' },
  '售货员': { p: 'shòuhuòyuán', m: 'nhân viên bán hàng' },
  '服务员': { p: 'fúwùyuán', m: 'nhân viên phục vụ' },
  '秘书': { p: 'mìshū', m: 'thư ký' },
  '教授': { p: 'jiàoshòu', m: 'giáo sư' },
  '经理': { p: 'jīnglǐ', m: 'giám đốc, quản lý' },
  '老板': { p: 'lǎobǎn', m: 'ông chủ' },
  '王': { p: 'Wáng', m: 'họ Vương' },
  '李': { p: 'Lǐ', m: 'họ Lý' },
  '张': { p: 'Zhāng', m: 'họ Trương' },
  '玛丽': { p: 'Mǎlì', m: 'Mary (tên riêng)' },
  '学校': { p: 'xuéxiào', m: 'trường học' },
  '大学': { p: 'dàxué', m: 'trường đại học' },
  '北京大学': { p: 'Běijīng Dàxué', m: 'Đại học Bắc Kinh' },
  '食堂': { p: 'shítáng', m: 'nhà ăn, căng-tin' },
  '餐厅': { p: 'cāntīng', m: 'nhà hàng, phòng ăn' },
  '饭店': { p: 'fàndiàn', m: 'nhà hàng, khách sạn' },
  '商店': { p: 'shāngdiàn', m: 'cửa hàng' },
  '书店': { p: 'shūdiàn', m: 'hiệu sách' },
  '超市': { p: 'chāoshì', m: 'siêu thị' },
  '市场': { p: 'shìchǎng', m: 'chợ, thị trường' },
  '银行': { p: 'yínháng', m: 'ngân hàng' },
  '医院': { p: 'yīyuàn', m: 'bệnh viện' },
  '图书馆': { p: 'túshūguǎn', m: 'thư viện' },
  '办公室': { p: 'bàngōngshì', m: 'văn phòng' },
  '教室': { p: 'jiàoshì', m: 'phòng học' },
  '宿舍': { p: 'sùshè', m: 'ký túc xá' },
  '房间': { p: 'fángjiān', m: 'căn phòng' },
  '屋': { p: 'wū', m: 'phòng, nhà' },
  '屋里': { p: 'wū lǐ', m: 'trong phòng' },
  '家': { p: 'jiā', m: 'nhà, gia đình' },
  '公园': { p: 'gōngyuán', m: 'công viên' },
  '花园': { p: 'huāyuán', m: 'vườn hoa' },
  '农场': { p: 'nóngchǎng', m: 'nông trại' },
  '路': { p: 'lù', m: 'đường' },
  '路上': { p: 'lùshang', m: 'trên đường' },
  '中国': { p: 'Zhōngguó', m: 'Trung Quốc' },
  '北京': { p: 'Běijīng', m: 'Bắc Kinh' },
  '美国': { p: 'Měiguó', m: 'nước Mỹ' },
  '英国': { p: 'Yīngguó', m: 'nước Anh' },
  '日本': { p: 'Rìběn', m: 'Nhật Bản' },
  '韩国': { p: 'Hánguó', m: 'Hàn Quốc' },
  '法国': { p: 'Fǎguó', m: 'nước Pháp' },
  '德国': { p: 'Déguó', m: 'nước Đức' },
  '越南': { p: 'Yuènán', m: 'Việt Nam' },
  '世界': { p: 'shìjiè', m: 'thế giới' },
  '世界上': { p: 'shìjiè shang', m: 'trên thế giới' },
  '汉语': { p: 'Hànyǔ', m: 'tiếng Hán (tiếng Trung)' },
  '中文': { p: 'Zhōngwén', m: 'tiếng Trung, Trung văn' },
  '英语': { p: 'Yīngyǔ', m: 'tiếng Anh' },
  '英文': { p: 'Yīngwén', m: 'tiếng Anh' },
  '法文': { p: 'Fǎwén', m: 'tiếng Pháp' },
  '德文': { p: 'Déwén', m: 'tiếng Đức' },
  '日文': { p: 'Rìwén', m: 'tiếng Nhật' },
  '韩文': { p: 'Hánwén', m: 'tiếng Hàn' },
  '俄文': { p: 'Éwén', m: 'tiếng Nga' },
  '西班牙文': { p: 'Xībānyáwén', m: 'tiếng Tây Ban Nha' },
  '阿拉伯文': { p: 'Ālābówén', m: 'tiếng Ả Rập' },
  '文': { p: 'wén', m: 'văn, ngôn ngữ, chữ viết' },
  '汉': { p: 'Hàn', m: 'Hán, tiếng Trung' },
  '汉越': { p: 'Hàn-Yuè', m: 'Hán - Việt' },
  '汉越词典': { p: 'Hàn-Yuè cídiǎn', m: 'từ điển Hán - Việt' },
  '汉字': { p: 'Hànzì', m: 'chữ Hán' },
  '发音': { p: 'fāyīn', m: 'phát âm' },
  '词典': { p: 'cídiǎn', m: 'từ điển' },
  '书': { p: 'shū', m: 'sách' },
  '杂志': { p: 'zázhì', m: 'tạp chí' },
  '笔': { p: 'bǐ', m: 'bút' },
  '钢笔': { p: 'gāngbǐ', m: 'bút máy' },
  '空调': { p: 'kōngtiáo', m: 'máy điều hòa' },
  '牙': { p: 'yá', m: 'răng' },
  '牙刷': { p: 'yáshuā', m: 'bàn chải đánh răng' },
  // Ẩm thực, trái cây, động vật, đời sống
  '水': { p: 'shuǐ', m: 'nước' },
  '茶': { p: 'chá', m: 'trà' },
  '热茶': { p: 'rè chá', m: 'trà nóng' },
  '咖啡': { p: 'kāfēi', m: 'cà phê' },
  '牛奶': { p: 'niúnǎi', m: 'sữa bò' },
  '酸奶': { p: 'suānnǎi', m: 'sữa chua' },
  '奶茶': { p: 'nǎichá', m: 'trà sữa' },
  '果汁': { p: 'guǒzhī', m: 'nước ép trái cây' },
  '可乐': { p: 'kělè', m: 'Coca-Cola' },
  '啤酒': { p: 'píjiǔ', m: 'bia' },
  '酒': { p: 'jiǔ', m: 'rượu, bia' },
  '汤': { p: 'tāng', m: 'canh, súp' },
  '鸡蛋': { p: 'jīdàn', m: 'trứng gà' },
  '鸡蛋汤': { p: 'jīdàn tāng', m: 'canh trứng gà' },
  '饭': { p: 'fàn', m: 'cơm, bữa ăn' },
  '米饭': { p: 'mǐfàn', m: 'cơm trắng' },
  '早饭': { p: 'zǎofàn', m: 'bữa sáng' },
  '午饭': { p: 'wǔfàn', m: 'bữa trưa' },
  '晚饭': { p: 'wǎnfàn', m: 'bữa tối' },
  '炒饭': { p: 'chǎofàn', m: 'cơm rang' },
  '大米': { p: 'dàmǐ', m: 'gạo' },
  '米': { p: 'mǐ', m: 'gạo / mét' },
  '面条': { p: 'miàntiáo', m: 'mì sợi' },
  '面条儿': { p: 'miàntiáor', m: 'mì sợi' },
  '牛肉': { p: 'niúròu', m: 'thịt bò' },
  '菜': { p: 'cài', m: 'món ăn, rau' },
  '美食': { p: 'měishí', m: 'ẩm thực, món ngon' },
  '馒头': { p: 'mántou', m: 'màn thầu (bánh bao chay)' },
  '包子': { p: 'bāozi', m: 'bánh bao' },
  '饺子': { p: 'jiǎozi', m: 'há cảo, sủi cảo' },
  '水果': { p: 'shuǐguǒ', m: 'hoa quả, trái cây' },
  '苹果': { p: 'píngguǒ', m: 'quả táo' },
  '橘子': { p: 'júzi', m: 'quả quýt' },
  '香蕉': { p: 'xiāngjiāo', m: 'quả chuối' },
  '葡萄': { p: 'pútao', m: 'quả nho' },
  '西瓜': { p: 'xīguā', m: 'dưa hấu' },
  '梨': { p: 'lí', m: 'quả lê' },
  '蜂蜜': { p: 'fēngmì', m: 'mật ong' },
  '蜜蜂': { p: 'mìfēng', m: 'con ong mật' },
  '小蜜蜂': { p: 'xiǎo mìfēng', m: 'chú ong nhỏ' },
  '奶牛': { p: 'nǎiniú', m: 'bò sữa' },
  '小鸡': { p: 'xiǎojī', m: 'gà con' },
  // Thời gian, tính từ, khái niệm khác
  '今天': { p: 'jīntiān', m: 'hôm nay' },
  '明天': { p: 'míngtiān', m: 'ngày mai' },
  '昨天': { p: 'zuótiān', m: 'hôm qua' },
  '每天': { p: 'měitiān', m: 'mỗi ngày, hàng ngày' },
  '今年': { p: 'jīnnián', m: 'năm nay' },
  '明年': { p: 'míngnián', m: 'năm sau, sang năm' },
  '去年': { p: 'qùnián', m: 'năm ngoái' },
  '年': { p: 'nián', m: 'năm' },
  '月': { p: 'yuè', m: 'tháng / mặt trăng' },
  '日': { p: 'rì', m: 'ngày / mặt trời' },
  '号': { p: 'hào', m: 'ngày / số' },
  '星期': { p: 'xīngqī', m: 'tuần, thứ' },
  '周末': { p: 'zhōumò', m: 'cuối tuần' },
  '早上': { p: 'zǎoshang', m: 'buổi sáng sớm' },
  '上午': { p: 'shàngwǔ', m: 'buổi sáng' },
  '中午': { p: 'zhōngwǔ', m: 'buổi trưa' },
  '下午': { p: 'xiàwǔ', m: 'buổi chiều' },
  '晚上': { p: 'wǎnshang', m: 'buổi tối' },
  '现在': { p: 'xiànzài', m: 'bây giờ, hiện tại' },
  '夏天': { p: 'xiàtiān', m: 'mùa hè' },
  '冬天': { p: 'dōngtiān', m: 'mùa đông' },
  '春天': { p: 'chūntiān', m: 'mùa xuân' },
  '秋天': { p: 'qiūtiān', m: 'mùa thu' },
  '身体': { p: 'shēntǐ', m: 'cơ thể, sức khỏe' },
  '身': { p: 'shēn', m: 'thân thể, người' },
  '健康': { p: 'jiànkāng', m: 'khỏe mạnh, sức khỏe' },
  '名字': { p: 'míngzi', m: 'tên' },
  '贵姓': { p: 'guìxìng', m: 'quý danh (hỏi họ)' },
  '姓': { p: 'xìng', m: 'họ, mang họ' },
  '会议': { p: 'huìyì', m: 'cuộc họp, hội nghị' },
  '交通': { p: 'jiāotōng', m: 'giao thông' },
  '事故': { p: 'shìgù', m: 'tai nạn, sự cố' },
  '交通事故': { p: 'jiāotōng shìgù', m: 'tai nạn giao thông' },
  '意思': { p: 'yìsi', m: 'ý nghĩa' },
  '有意思': { p: 'yǒu yìsi', m: 'thú vị, hay' },
  '有趣': { p: 'yǒuqù', m: 'thú vị' },
  '有空': { p: 'yǒukòng', m: 'rảnh rỗi, có thời gian' },
  '好': { p: 'hǎo', m: 'tốt, khỏe, ngon' },
  '好喝': { p: 'hǎohē', m: 'ngon (đồ uống)' },
  '好吃': { p: 'hǎochī', m: 'ngon (đồ ăn)' },
  '好看': { p: 'hǎokàn', m: 'đẹp, hay (phim/sách)' },
  '好听': { p: 'hǎotīng', m: 'hay, êm tai' },
  '大': { p: 'dà', m: 'to, lớn' },
  '小': { p: 'xiǎo', m: 'nhỏ, bé' },
  '多': { p: 'duō', m: 'nhiều' },
  '少': { p: 'shǎo', m: 'ít' },
  '贵': { p: 'guì', m: 'đắt / quý' },
  '便宜': { p: 'piányi', m: 'rẻ' },
  '甜': { p: 'tián', m: 'ngọt' },
  '酸': { p: 'suān', m: 'chua' },
  '冷': { p: 'lěng', m: 'lạnh' },
  '热': { p: 'rè', m: 'nóng' },
  '冰': { p: 'bīng', m: 'đá lạnh, ướp lạnh' },
  '新': { p: 'xīn', m: 'mới' },
  '新鲜': { p: 'xīnxiān', m: 'tươi, tươi mới' },
  '忙': { p: 'máng', m: 'bận, bận rộn' },
  '累': { p: 'lèi', m: 'mệt' },
  '高兴': { p: 'gāoxìng', m: 'vui vẻ, vui mừng' },
  '客气': { p: 'kèqi', m: 'khách sáo, lịch sự' },
  '不客气': { p: 'bú kèqi', m: 'đừng khách sáo, không có gì' },
  '热闹': { p: 'rènao', m: 'náo nhiệt, nhộn nhịp' },
  '认真': { p: 'rènzhēn', m: 'chăm chỉ, nghiêm túc' },
  '难': { p: 'nán', m: 'khó' },
  '容易': { p: 'róngyì', m: 'dễ, dễ dàng' },
  '里': { p: 'lǐ', m: 'bên trong' }
};

var _cachedWordMap = null;
var _cachedDataSize = 0;

function getWordLookupMap() {
  var dataKeys = (typeof DATA !== 'undefined' && DATA) ? Object.keys(DATA).length : 0;
  if (_cachedWordMap && _cachedDataSize === dataKeys) {
    // Also merge current active deck words dynamically
    var activeDeck = (window.AppState && window.AppState.deck) || (typeof deck !== 'undefined' ? deck : []) || [];
    activeDeck.forEach(function(w) {
      if (w && w.h && (w.p || w.m)) {
        w.h.split('|').forEach(function(v) {
          v = v.trim();
          if (v && !_cachedWordMap.has(v)) {
            _cachedWordMap.set(v, { p: w.p || '', m: w.m || '' });
          }
        });
      }
    });
    return _cachedWordMap;
  }

  var map = new Map();

  // 1. Load _EXTRA_WORD_DICT
  Object.keys(_EXTRA_WORD_DICT).forEach(function(k) {
    map.set(k, _EXTRA_WORD_DICT[k]);
  });

  // 2. Load WQ_SENTENCE_BANK
  if (typeof window !== 'undefined' && window.WQ_SENTENCE_BANK) {
    Object.keys(window.WQ_SENTENCE_BANK).forEach(function(k) {
      var entry = window.WQ_SENTENCE_BANK[k];
      if (entry && (entry.p || entry.m)) {
        k.split('|').forEach(function(v) {
          v = v.trim();
          if (v) map.set(v, { p: entry.p || '', m: entry.m || '' });
        });
      }
    });
  }

  // 3. Load DATA (HSK 1..6)
  if (typeof DATA !== 'undefined' && DATA) {
    Object.keys(DATA).forEach(function(lvl) {
      (DATA[lvl] || []).forEach(function(w) {
        if (!w || !w.h) return;
        w.h.split('|').forEach(function(v) {
          v = v.trim();
          if (!v) return;
          if (!map.has(v)) {
            map.set(v, { p: w.p || '', m: w.m || '' });
          }
          if (v.length > 1 && v.endsWith('儿')) {
            var noEr = v.slice(0, -1);
            if (!map.has(noEr)) {
              map.set(noEr, { p: (w.p || '').replace(/r$/, ''), m: w.m || '' });
            }
          }
        });
      });
    });
  }

  // 4. Load custom decks & custom sentences from localStorage (including per-token meanings)
  try {
    var cSent = JSON.parse(localStorage.getItem('wq_custom_sentences')) || {};
    Object.keys(cSent).forEach(function(k) {
      var item = cSent[k];
      if (!item) return;
      if ((item.p || item.m) && !map.has(k)) {
        map.set(k, { p: item.p || '', m: item.m || '' });
      }
      if (Array.isArray(item.tokens)) {
        item.tokens.forEach(function(tk) {
          if (tk && typeof tk === 'object') {
            var th = (tk.h || tk.t || tk.w || '').trim();
            if (th && (tk.p || tk.m)) {
              map.set(th, { p: tk.p || '', m: tk.m || '' });
            }
          }
        });
      }
      if (Array.isArray(item.examples)) {
        item.examples.forEach(function(exItem) {
          if (exItem && Array.isArray(exItem.tokens)) {
            exItem.tokens.forEach(function(tk) {
              if (tk && typeof tk === 'object') {
                var th = (tk.h || tk.t || tk.w || '').trim();
                if (th && (tk.p || tk.m)) {
                  map.set(th, { p: tk.p || '', m: tk.m || '' });
                }
              }
            });
          }
        });
      }
    });
    var cDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
    cDecks.forEach(function(d) {
      (d.words || []).forEach(function(w) {
        if (w && w.h && (w.p || w.m)) {
          w.h.split('|').forEach(function(v) {
            v = v.trim();
            if (v && !map.has(v)) {
              map.set(v, { p: w.p || '', m: w.m || '' });
            }
          });
        }
        if (w && Array.isArray(w.tokens)) {
          w.tokens.forEach(function(tk) {
            if (tk && typeof tk === 'object') {
              var th = (tk.h || tk.t || tk.w || '').trim();
              if (th && (tk.p || tk.m)) {
                map.set(th, { p: tk.p || '', m: tk.m || '' });
              }
            }
          });
        }
        if (w && Array.isArray(w.examples)) {
          w.examples.forEach(function(exItem) {
            if (exItem && Array.isArray(exItem.tokens)) {
              exItem.tokens.forEach(function(tk) {
                if (tk && typeof tk === 'object') {
                  var th = (tk.h || tk.t || tk.w || '').trim();
                  if (th && (tk.p || tk.m)) {
                    map.set(th, { p: tk.p || '', m: tk.m || '' });
                  }
                }
              });
            }
          });
        }
      });
    });
  } catch (e) {}

  _cachedWordMap = map;
  _cachedDataSize = dataKeys;
  return map;
}

function lookupWordInfo(token) {
  if (!token) return null;
  var clean = token.replace(/[，。？！、；：“”‘’（）().,?!\s]+/g, '').trim();
  if (!clean) return null;

  var map = getWordLookupMap();

  // Check explicit token metadata on current question (if JSON provided tokens: [{h, p, m}])
  if (sCur && Array.isArray(sCur.tokens)) {
    for (var ti = 0; ti < sCur.tokens.length; ti++) {
      var tkObj = sCur.tokens[ti];
      if (tkObj && typeof tkObj === 'object') {
        var tkH = (tkObj.h || tkObj.t || tkObj.w || '').trim();
        if (tkH === clean && (tkObj.p || tkObj.m)) {
          return { h: clean, p: tkObj.p || '', m: tkObj.m || '' };
        }
      }
    }
  }

  // Direct match
  if (map.has(clean)) {
    return { h: clean, p: map.get(clean).p, m: map.get(clean).m };
  }

  // Check current question target word
  if (sCur && getCleanHanzi(sCur.h) === clean) {
    return { h: clean, p: sCur.p || '', m: sCur.m || '' };
  }

  // Decompose compound token into longest known sub-words
  if (clean.length > 1) {
    var pParts = [];
    var mParts = [];
    var i = 0;
    var allFound = true;
    while (i < clean.length) {
      var subMatch = null;
      var subLen = 0;
      for (var len = clean.length - i; len >= 1; len--) {
        var sub = clean.slice(i, i + len);
        if (map.has(sub)) {
          subMatch = map.get(sub);
          subLen = len;
          break;
        }
      }
      if (subMatch) {
        if (subMatch.p) pParts.push(subMatch.p);
        if (subMatch.m) mParts.push(subMatch.m.split(/[,;，；/]/)[0].trim());
        i += subLen;
      } else {
        allFound = false;
        i++;
      }
    }
    if (pParts.length > 0) {
      return {
        h: clean,
        p: pParts.join(' '),
        m: mParts.join(' + ')
      };
    }
  }

  return null;
}

// Floating tooltip DOM singleton
var _tooltipEl = null;
var _tooltipHideTimer = null;

function ensureTooltipEl() {
  if (_tooltipEl) return _tooltipEl;
  _tooltipEl = document.createElement('div');
  _tooltipEl.id = 'sFloatingTooltip';
  _tooltipEl.className = 's-word-tooltip';
  _tooltipEl.style.display = 'none';
  document.body.appendChild(_tooltipEl);
  return _tooltipEl;
}

function showWordTooltip(targetEl, info, modeOpts) {
  if (!targetEl || !info) return;
  if (!info.p && !info.m) return;

  clearTimeout(_tooltipHideTimer);
  var tip = ensureTooltipEl();
  var hideMeaning = modeOpts && modeOpts.hideMeaning;

  var html = '<div class="s-tip-hanzi">' + (info.h || '') + '</div>';
  if (info.p) {
    html += '<div class="s-tip-pinyin">' + info.p + '</div>';
  }
  if (!hideMeaning && info.m) {
    html += '<div class="s-tip-meaning">' + info.m + '</div>';
  }
  tip.innerHTML = html;
  tip.style.display = 'block';
  tip.classList.add('visible');

  // Position above targetEl
  var rect = targetEl.getBoundingClientRect();
  var tipRect = tip.getBoundingClientRect();
  var top = rect.top - tipRect.height - 10;
  var placeBelow = false;
  if (top < 12) {
    top = rect.bottom + 10;
    placeBelow = true;
  }
  tip.classList.toggle('below', placeBelow);

  var left = rect.left + (rect.width / 2) - (tipRect.width / 2);
  var maxLeft = window.innerWidth - tipRect.width - 12;
  if (left < 12) left = 12;
  if (left > maxLeft) left = Math.max(12, maxLeft);

  tip.style.top = Math.round(top) + 'px';
  tip.style.left = Math.round(left) + 'px';
}

function hideWordTooltip() {
  if (!_tooltipEl) return;
  _tooltipEl.classList.remove('visible');
  _tooltipHideTimer = setTimeout(function() {
    if (_tooltipEl && !_tooltipEl.classList.contains('visible')) {
      _tooltipEl.style.display = 'none';
    }
  }, 150);
}

function bindTooltipEvents(el, getInfoFn) {
  if (!el) return;
  el.addEventListener('mouseenter', function() {
    var res = getInfoFn();
    if (res && res.info) showWordTooltip(el, res.info, res.opts);
  });
  el.addEventListener('mouseleave', function() {
    hideWordTooltip();
  });
  el.addEventListener('focus', function() {
    var res = getInfoFn();
    if (res && res.info) showWordTooltip(el, res.info, res.opts);
  });
  el.addEventListener('blur', function() {
    hideWordTooltip();
  });
  el.addEventListener('touchstart', function() {
    var res = getInfoFn();
    if (res && res.info) {
      showWordTooltip(el, res.info, res.opts);
      setTimeout(hideWordTooltip, 2200);
    }
  }, { passive: true });
}

function renderInteractiveChineseSpan(container, text, highlightWord) {
  if (!container || !text) return;
  var map = getWordLookupMap();
  var knownSet = new Set();
  map.forEach(function(_, k) {
    if (k.length >= 2) knownSet.add(k);
  });
  if (highlightWord && highlightWord.length >= 2) knownSet.add(highlightWord);

  var i = 0;
  var n = text.length;
  while (i < n) {
    // Check punctuation or whitespace
    if (/^[，。？！、；：“”‘’（）().,?!\s]+$/.test(text[i])) {
      var punctSpan = document.createElement('span');
      punctSpan.className = 's-ctx-punct';
      punctSpan.textContent = text[i];
      container.appendChild(punctSpan);
      i++;
      continue;
    }

    // Find next punctuation boundary
    var clauseEnd = i;
    while (clauseEnd < n && !/^[，。？！、；：“”‘’（）().,?!\s]+$/.test(text[clauseEnd])) {
      clauseEnd++;
    }
    var clause = text.slice(i, clauseEnd);
    var tokens = segmentChunk(clause, knownSet);
    tokens.forEach(function(tok) {
      var wordSpan = document.createElement('span');
      var isTarget = highlightWord && tok === highlightWord;
      wordSpan.className = 's-ctx-word' + (isTarget ? ' s-highlight-word' : '');
      wordSpan.textContent = tok;
      bindTooltipEvents(wordSpan, function() {
        return { info: lookupWordInfo(tok) };
      });
      wordSpan.onclick = function(e) {
        e.stopPropagation();
        var info = lookupWordInfo(tok);
        if (info) showWordTooltip(wordSpan, info);
        if (typeof speak === 'function') speak(tok);
      };
      container.appendChild(wordSpan);
    });

    i = clauseEnd;
  }
}


// ==================== ENRICH WORD WITH SENTENCE ====================
function enrichWord(w) {
  if (!w || !w.h) return null;
  if (typeof window.enrichWordWithSentence === 'function') {
    return window.enrichWordWithSentence(w);
  }
  return w;
}

function getCleanHanzi(h) {
  if (!h) return '';
  return h.split('|')[0].trim();
}

function findMatchedVariant(ex, h) {
  if (!ex || !h) return getCleanHanzi(h);
  var variants = h.split('|').map(function(s) { return s.trim(); }).filter(Boolean);
  for (var i = 0; i < variants.length; i++) {
    if (ex.indexOf(variants[i]) !== -1) return variants[i];
  }
  // If phrase has spaces or 儿 suffix, try without 儿
  var clean = variants[0];
  if (clean.endsWith('儿') && ex.indexOf(clean.slice(0, -1)) !== -1) {
    return clean.slice(0, -1);
  }
  return clean;
}

// ==================== SEGMENT CHINESE SENTENCE ====================
function segmentChineseSentence(sentence, targetWord, deckWords) {
  if (!sentence) return { tokens: [], punct: '。' };

  var trimmed = sentence.trim();
  var punctMatch = trimmed.match(/[。？！.?!]+$/);
  var endPunct = punctMatch ? punctMatch[0] : '。';
  var body = trimmed.replace(/[。？！.?!]+$/, '').trim();

  // Build known multi-char word set from current deck + DATA + targetWord + lookup dictionary
  var knownWords = new Set();
  if (targetWord) knownWords.add(targetWord);
  var lookupMap = getWordLookupMap();
  lookupMap.forEach(function(_, k) {
    if (k.length >= 2) knownWords.add(k);
  });
  if (Array.isArray(deckWords)) {
    deckWords.forEach(function(item) {
      if (!item || !item.h) return;
      item.h.split('|').forEach(function(v) {
        v = v.trim();
        if (v.length >= 2) knownWords.add(v);
      });
    });
  }
  if (typeof DATA !== 'undefined') {
    Object.keys(DATA).forEach(function(lvl) {
      (DATA[lvl] || []).forEach(function(item) {
        if (!item || !item.h) return;
        item.h.split('|').forEach(function(v) {
          v = v.trim();
          if (v.length >= 2) knownWords.add(v);
        });
      });
    });
  }

  // Split by comma/pause punctuation first, keeping clauses clean
  var clauses = body.split(/[，、；：,;:]+/).map(function(c) { return c.trim(); }).filter(Boolean);
  var rawTokens = [];

  clauses.forEach(function(clause) {
    // Protect targetWord inside clause so it is never split apart
    if (targetWord && targetWord.length >= 2 && clause.indexOf(targetWord) !== -1) {
      var parts = clause.split(targetWord);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i]) {
          rawTokens.push.apply(rawTokens, segmentChunk(parts[i], knownWords));
        }
        if (i < parts.length - 1) {
          rawTokens.push(targetWord);
        }
      }
    } else {
      rawTokens.push.apply(rawTokens, segmentChunk(clause, knownWords));
    }
  });

  // Filter out empty or pure-punctuation tokens
  var tokens = rawTokens.map(function(t) { return t.trim(); }).filter(function(t) {
    return t.length > 0 && !/^[，。？！、；：“”‘’（）().,?!\s]+$/.test(t);
  });

  // If too many tiny tokens (> 8), merge adjacent single-character tokens (except targetWord)
  while (tokens.length > 8) {
    var merged = false;
    for (var j = 0; j < tokens.length - 1; j++) {
      if (tokens[j] !== targetWord && tokens[j + 1] !== targetWord &&
          tokens[j].length === 1 && tokens[j + 1].length === 1) {
        tokens.splice(j, 2, tokens[j] + tokens[j + 1]);
        merged = true;
        break;
      }
    }
    if (!merged) break;
  }

  return { tokens: tokens, punct: endPunct };
}

function segmentChunk(text, knownWords) {
  if (!text) return [];
  // Use Intl.Segmenter if available, but prefer longest dictionary match for known vocabulary
  var result = [];
  var i = 0;
  var n = text.length;

  while (i < n) {
    // Skip spaces
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    var matched = null;
    var maxLen = Math.min(5, n - i);
    for (var len = maxLen; len >= 2; len--) {
      var sub = text.slice(i, i + len);
      if (knownWords.has(sub)) {
        matched = sub;
        break;
      }
    }
    if (matched) {
      result.push(matched);
      i += matched.length;
    } else {
      // Collect contiguous unknown span and pass to Intl.Segmenter if available
      var spanStart = i;
      i++;
      while (i < n) {
        var hasKnownAhead = false;
        var checkMax = Math.min(5, n - i);
        for (var l2 = checkMax; l2 >= 2; l2--) {
          if (knownWords.has(text.slice(i, i + l2))) {
            hasKnownAhead = true;
            break;
          }
        }
        if (hasKnownAhead) break;
        i++;
      }
      var unknownSpan = text.slice(spanStart, i);
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        var seg = new Intl.Segmenter('zh-CN', { granularity: 'word' });
        var iter = seg.segment(unknownSpan);
        for (var item of iter) {
          if (item.segment && item.segment.trim()) {
            result.push(item.segment.trim());
          }
        }
      } else {
        for (var c = 0; c < unknownSpan.length; c++) {
          if (unknownSpan[c].trim()) result.push(unknownSpan[c]);
        }
      }
    }
  }
  return result;
}

// ==================== PREPARE SENTENCE DECK ====================
function buildSentencePoolFromDeck(rawDeck) {
  if (!Array.isArray(rawDeck)) return [];
  var enriched = rawDeck.map(enrichWord).filter(function(w) {
    return w && w.h && w.ex && w.ex.trim().length >= 2;
  });
  return deduplicateWords(enriched);
}

function requeueWordForReview(wordObj) {
  if (!wordObj || !wordObj.h) return;
  var cleanKey = getCleanHanzi(wordObj.h);
  var alreadyInPool = sPool.some(function(w) { return w && getCleanHanzi(w.h) === cleanKey; });
  if (alreadyInPool) return;
  var copy = Object.assign({}, wordObj, { _isRetry: true });
  var offset = Math.min(sPool.length, 2 + Math.floor(Math.random() * 2));
  sPool.splice(offset, 0, copy);
}

function switchCurrentWordSentence() {
  if (!sCur || !Array.isArray(sCur.examples) || sCur.examples.length <= 1) return;
  var cleanKey = getCleanHanzi(sCur.h);
  var wasRetry = sCur._isRetry;
  sCur = typeof window.pickRandomSentenceVariant === 'function'
    ? window.pickRandomSentenceVariant(sCur, sCur.ex, true)
    : sCur;
  if (wasRetry) sCur._isRetry = true;
  sLastSentenceByWord[cleanKey] = sCur.ex;
  sAnswered = false;
  var feedbackEl = document.getElementById('sFeedback');
  if (feedbackEl) feedbackEl.style.display = 'none';
  var curDeck = (window.AppState && window.AppState.deck && window.AppState.deck.length)
    ? window.AppState.deck : deck;
  var validDeck = buildSentencePoolFromDeck(curDeck);
  renderCurrentQuestionUI(validDeck);
  if (window.showToast) {
    showToast('🎲 Đã đổi sang câu ví dụ ' + ((sCur._variantIndex || 0) + 1) + '/' + sCur.examples.length + ' của từ "' + cleanKey + '"', 'info');
  }
}
window.switchCurrentWordSentence = switchCurrentWordSentence;

function renderCurrentQuestionUI(validDeck) {
  var meaningEl = document.getElementById('sMeaningPrompt');
  var wordHintEl = document.getElementById('sWordHint');
  var arrangeArea = document.getElementById('sArrangeArea');
  var fillArea = document.getElementById('sFillArea');

  // Decide sub-mode for this question
  sTargetMatch = (sCur.blank && sCur.ex.indexOf(sCur.blank) !== -1)
    ? sCur.blank
    : findMatchedVariant(sCur.ex, sCur.h);
  var canFill = sCur.ex.indexOf(sTargetMatch) !== -1 && (validDeck.length >= 2 || (Array.isArray(sCur.options) && sCur.options.length >= 2));

  if (sMode === 'arrange') {
    sActiveSubMode = 'arrange';
  } else if (sMode === 'fill') {
    sActiveSubMode = canFill ? 'fill' : 'arrange';
  } else {
    // mix mode
    sActiveSubMode = (canFill && Math.random() < 0.5) ? 'fill' : 'arrange';
  }

  // Render prompt header
  var badgeEl = document.getElementById('sTaskBadge');
  if (badgeEl) {
    badgeEl.textContent = sActiveSubMode === 'arrange'
      ? '🧩 Sắp xếp các mảnh từ thành câu hoàn chỉnh'
      : '✍️ Chọn từ thích hợp điền vào chỗ trống';
  }

  if (meaningEl) {
    meaningEl.textContent = sCur.exm || ('Câu chứa từ "' + getCleanHanzi(sCur.h) + '" (' + (sCur.m || '') + ')');
  }

  if (wordHintEl) {
    var baseHint = sActiveSubMode === 'arrange'
      ? '💡 Từ vựng trọng tâm: <strong>' + getCleanHanzi(sCur.h) + '</strong> (' + (sCur.p || '') + ') — ' + (sCur.m || '')
      : '💡 Gợi ý nghĩa từ cần điền: <strong>' + (sCur.m || '') + '</strong>';
    var extraBadges = '';
    if (sCur._isRetry) {
      extraBadges += ' <span style="display:inline-flex; align-items:center; gap:4px; margin-left:8px; padding:2px 8px; border-radius:999px; font-size:0.75rem; font-weight:700; background:rgba(245,158,11,0.14); color:#d97706; border:1px solid rgba(245,158,11,0.35);">🔄 Ôn lại từ sai</span>';
    }
    if (Array.isArray(sCur.examples) && sCur.examples.length > 1) {
      var vIdx = (typeof sCur._variantIndex === 'number' ? sCur._variantIndex : 0) + 1;
      extraBadges += ' <button type="button" onclick="window.switchCurrentWordSentence && window.switchCurrentWordSentence()" style="display:inline-flex; align-items:center; gap:4px; margin-left:8px; padding:2px 9px; border-radius:999px; font-size:0.75rem; font-weight:700; cursor:pointer; background:rgba(139,92,246,0.12); color:var(--accent-purple); border:1px solid rgba(139,92,246,0.35);">🎲 Câu ' + vIdx + '/' + sCur.examples.length + ' · Đổi câu</button>';
    }
    wordHintEl.innerHTML = baseHint + extraBadges;
  }

  if (sActiveSubMode === 'arrange') {
    if (arrangeArea) arrangeArea.style.display = 'block';
    if (fillArea) fillArea.style.display = 'none';
    setupArrangeQuestion(sCur, validDeck);
  } else {
    if (arrangeArea) arrangeArea.style.display = 'none';
    if (fillArea) fillArea.style.display = 'block';
    setupFillQuestion(sCur, validDeck);
  }
}

// ==================== NEW SENTENCE QUESTION ====================
function newSentenceQuestion() {
  var feedbackEl = document.getElementById('sFeedback');
  if (feedbackEl) feedbackEl.style.display = 'none';

  var curDeck = (window.AppState && window.AppState.deck && window.AppState.deck.length)
    ? window.AppState.deck : deck;

  var validDeck = buildSentencePoolFromDeck(curDeck);

  var meaningEl = document.getElementById('sMeaningPrompt');
  var wordHintEl = document.getElementById('sWordHint');
  var arrangeArea = document.getElementById('sArrangeArea');
  var fillArea = document.getElementById('sFillArea');

  if (!validDeck || validDeck.length === 0) {
    if (meaningEl) meaningEl.textContent = 'Bộ từ này chưa có câu ví dụ. Hãy thêm câu ví dụ ở mục Tự tạo hoặc chọn bộ từ khác!';
    if (wordHintEl) wordHintEl.textContent = '';
    if (arrangeArea) arrangeArea.style.display = 'none';
    if (fillArea) fillArea.style.display = 'none';
    return;
  }

  if (!sPool || sPool.length === 0) {
    sPool = validDeck.slice();
    shuffle(sPool);
    sAsked = [];
    sScore = 0;
    sTotal = 0;
    updateScoreUI();
  }

  var rawWord = sPool.shift();
  var cleanKey = getCleanHanzi(rawWord.h);
  sCur = typeof window.pickRandomSentenceVariant === 'function'
    ? window.pickRandomSentenceVariant(rawWord, sLastSentenceByWord[cleanKey])
    : rawWord;
  if (rawWord._isRetry) sCur._isRetry = true;
  sLastSentenceByWord[cleanKey] = sCur.ex;

  sAsked.push(sCur);
  sAnswered = false;

  // Update progress counter
  var totalInCycle = sAsked.length + sPool.length;
  var progressEl = document.getElementById('sProgress');
  if (progressEl) {
    progressEl.textContent = 'Câu: ' + sAsked.length + ' / ' + totalInCycle;
  }

  var levelEl = document.getElementById('sLevel');
  var curLevel = (window.AppState && window.AppState.level) || level;
  if (levelEl) {
    levelEl.textContent = curLevel === 'favorites' ? 'Yêu thích' : curLevel;
  }

  renderCurrentQuestionUI(validDeck);
}

// ==================== MODE 1: ARRANGE SENTENCE ====================
function setupArrangeQuestion(wordObj, validDeck) {
  var punctMatch = (wordObj.ex || '').trim().match(/[。？！.?!]+$/);
  var explicitPunct = punctMatch ? punctMatch[0] : '。';

  if (Array.isArray(wordObj.tokens) && wordObj.tokens.length >= 2) {
    sTargetTokens = wordObj.tokens.map(function(tk) {
      if (typeof tk === 'string') return tk.replace(/[，。？！、；：“”‘’（）().,?!\s]+/g, '').trim();
      if (tk && typeof tk === 'object') return String(tk.h || tk.t || tk.w || '').replace(/[，。？！、；：“”‘’（）().,?!\s]+/g, '').trim();
      return '';
    }).filter(Boolean);
    sEndPunct = explicitPunct;
  } else {
    var seg = segmentChineseSentence(wordObj.ex, sTargetMatch, validDeck);
    sTargetTokens = seg.tokens;
    sEndPunct = seg.punct || '。';
  }

  var shuffled = sTargetTokens.map(function(t, idx) {
    return { id: 'tile_' + idx, text: t, used: false };
  });

  if (shuffled.length > 1) {
    var attempts = 0;
    do {
      shuffle(shuffled);
      attempts++;
    } while (
      attempts < 6 &&
      shuffled.map(function(x) { return x.text; }).join('') === sTargetTokens.join('')
    );
  }

  sBankItems = shuffled;
  sAnswerItems = [];

  var actionsEl = document.getElementById('sArrangeActions');
  if (actionsEl) actionsEl.style.display = 'flex';

  var zoneEl = document.getElementById('sAnswerZone');
  if (zoneEl) {
    zoneEl.classList.remove('correct-zone', 'wrong-zone');
  }

  renderArrangeUI();
}

function renderArrangeUI() {
  var zoneEl = document.getElementById('sAnswerZone');
  var bankEl = document.getElementById('sWordBank');
  if (!zoneEl || !bankEl) return;

  zoneEl.innerHTML = '';
  if (sAnswerItems.length === 0) {
    var ph = document.createElement('span');
    ph.className = 's-zone-placeholder';
    ph.textContent = 'Bấm chọn các từ bên dưới theo đúng thứ tự...';
    zoneEl.appendChild(ph);
  } else {
    sAnswerItems.forEach(function(item, ansIdx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      var statusClass = '';
      var isPosCorrect = (sTargetTokens[ansIdx] === item.text);
      if (sAnswered) {
        statusClass = isPosCorrect ? ' s-tile-correct' : ' s-tile-wrong';
      }
      btn.className = 's-tile s-tile-answer' + statusClass;
      btn.textContent = item.text;
      bindTooltipEvents(btn, function() {
        var baseInfo = lookupWordInfo(item.text);
        if (sAnswered && !isPosCorrect && sTargetTokens[ansIdx]) {
          var expected = sTargetTokens[ansIdx];
          var expInfo = lookupWordInfo(expected);
          var rightHint = '✗ Sai vị trí — Đúng phải là: ' + expected + (expInfo && expInfo.p ? ' (' + expInfo.p + ')' : '');
          return {
            info: {
              h: item.text,
              p: baseInfo ? baseInfo.p : '',
              m: (baseInfo && baseInfo.m ? baseInfo.m + '\n' : '') + rightHint
            }
          };
        }
        return { info: baseInfo };
      });
      btn.onclick = function() {
        hideWordTooltip();
        if (sAnswered) {
          if (!isPosCorrect) {
            retryWrongTiles();
            return;
          }
          if (typeof speak === 'function') speak(item.text);
          return;
        }
        removeTileFromAnswer(ansIdx);
      };
      zoneEl.appendChild(btn);
    });
    // Punctuation preview at end
    var punctSpan = document.createElement('span');
    punctSpan.className = 's-punct-preview';
    punctSpan.textContent = sEndPunct;
    zoneEl.appendChild(punctSpan);
  }

  bankEl.innerHTML = '';
  sBankItems.forEach(function(item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 's-tile s-tile-bank' + (item.used ? ' used' : '');
    btn.textContent = item.text;
    btn.disabled = item.used || sAnswered;
    bindTooltipEvents(btn, function() {
      return { info: lookupWordInfo(item.text) };
    });
    btn.onclick = function() {
      hideWordTooltip();
      if (sAnswered || item.used) return;
      addTileToAnswer(item.id);
    };
    bankEl.appendChild(btn);
  });
}

function addTileToAnswer(tileId) {
  var bankItem = sBankItems.find(function(b) { return b.id === tileId; });
  if (!bankItem || bankItem.used) return;
  bankItem.used = true;
  sAnswerItems.push({ id: bankItem.id, text: bankItem.text });
  if (typeof speak === 'function') speak(bankItem.text);
  renderArrangeUI();
}

function removeTileFromAnswer(ansIdx) {
  var removed = sAnswerItems.splice(ansIdx, 1)[0];
  if (!removed) return;
  var bankItem = sBankItems.find(function(b) { return b.id === removed.id; });
  if (bankItem) bankItem.used = false;
  renderArrangeUI();
}

function resetArrangeAnswer() {
  if (sAnswered) return;
  sAnswerItems = [];
  sBankItems.forEach(function(b) { b.used = false; });
  renderArrangeUI();
}

function checkArrangeAnswer() {
  if (sAnswered || !sCur) return;
  if (sAnswerItems.length === 0) {
    if (window.showToast) showToast('Hãy chọn các từ để ghép thành câu trước!', 'warning');
    return;
  }
  if (sAnswerItems.length < sBankItems.length) {
    if (window.showToast) showToast('Bạn vẫn chưa chọn hết các từ trong câu!', 'warning');
    return;
  }

  sAnswered = true;
  sTotal++;

  var userStr = sAnswerItems.map(function(x) { return x.text; }).join('');
  var targetStr = sTargetTokens.join('');
  var isCorrect = userStr === targetStr;

  var zoneEl = document.getElementById('sAnswerZone');
  if (isCorrect) {
    sScore++;
    if (zoneEl) {
      zoneEl.classList.remove('wrong-zone');
      zoneEl.classList.add('correct-zone');
    }
  } else {
    requeueWordForReview(sCur);
    if (zoneEl) {
      zoneEl.classList.remove('correct-zone');
      zoneEl.classList.add('wrong-zone');
    }
  }

  var actionsEl = document.getElementById('sArrangeActions');
  if (actionsEl) actionsEl.style.display = 'none';

  renderArrangeUI();
  updateScoreUI();
  recordSentenceSRS(getCleanHanzi(sCur.h), isCorrect);
  showFeedback(isCorrect);
  if (typeof speak === 'function') speak(sCur.ex);
}

function retryWrongTiles() {
  if (!sCur || sActiveSubMode !== 'arrange') return;
  sAnswered = false;

  // Keep tiles that are in the correct position, return wrong tiles to bank
  var keptAnswer = [];
  var keptIds = new Set();
  for (var i = 0; i < sAnswerItems.length; i++) {
    if (sAnswerItems[i].text === sTargetTokens[i]) {
      keptAnswer.push(sAnswerItems[i]);
      keptIds.add(sAnswerItems[i].id);
    } else {
      break; // Return from the first wrong position onwards so user can place in order
    }
  }

  sAnswerItems = keptAnswer;
  sBankItems.forEach(function(b) {
    b.used = keptIds.has(b.id);
  });

  var zoneEl = document.getElementById('sAnswerZone');
  if (zoneEl) zoneEl.classList.remove('correct-zone', 'wrong-zone');

  var actionsEl = document.getElementById('sArrangeActions');
  if (actionsEl) actionsEl.style.display = 'flex';

  var feedbackEl = document.getElementById('sFeedback');
  if (feedbackEl) feedbackEl.style.display = 'none';

  renderArrangeUI();
}

// ==================== MODE 2: FILL IN THE BLANK (CLOZE) ====================
function setupFillQuestion(wordObj, validDeck) {
  var clozeEl = document.getElementById('sClozeSentence');
  var pinyinEl = document.getElementById('sClozePinyin');
  var optsBox = document.getElementById('sFillOpts');
  if (!clozeEl || !optsBox) return;

  if (pinyinEl) {
    pinyinEl.style.display = 'none';
    pinyinEl.textContent = wordObj.exp || '';
  }

  // Replace first occurrence of sTargetMatch with blank slot & make surrounding words interactive
  var idx = wordObj.ex.indexOf(sTargetMatch);
  if (idx !== -1) {
    var before = wordObj.ex.slice(0, idx);
    var after = wordObj.ex.slice(idx + sTargetMatch.length);
    clozeEl.innerHTML = '';
    if (before) renderInteractiveChineseSpan(clozeEl, before);
    var slot = document.createElement('span');
    slot.className = 's-blank-slot';
    slot.id = 'sBlankSlot';
    slot.textContent = '____';
    clozeEl.appendChild(slot);
    if (after) renderInteractiveChineseSpan(clozeEl, after);
  } else {
    clozeEl.innerHTML = '';
    renderInteractiveChineseSpan(clozeEl, wordObj.ex);
    var slotFallback = document.createElement('span');
    slotFallback.className = 's-blank-slot';
    slotFallback.id = 'sBlankSlot';
    slotFallback.textContent = '____';
    clozeEl.appendChild(slotFallback);
  }

  // Build 4 options (1 correct + 3 distractors)
  var targetCleanH = sTargetMatch || getCleanHanzi(wordObj.h);
  var targetOptObj = {
    h: targetCleanH,
    p: wordObj.p || (lookupWordInfo(targetCleanH) || {}).p || '',
    m: wordObj.m || (lookupWordInfo(targetCleanH) || {}).m || ''
  };
  var opts = [targetOptObj];

  // If wordObj.options is explicitly provided in JSON, use those first
  if (Array.isArray(wordObj.options) && wordObj.options.length > 0) {
    wordObj.options.forEach(function(rawOpt) {
      if (opts.length >= 4) return;
      var oH = typeof rawOpt === 'string' ? rawOpt.trim() : String((rawOpt && (rawOpt.h || rawOpt.t || rawOpt.w)) || '').trim();
      if (!oH || getCleanHanzi(oH) === getCleanHanzi(targetCleanH)) return;
      if (opts.some(function(existing) { return getCleanHanzi(existing.h) === getCleanHanzi(oH); })) return;
      var fbInfo = lookupWordInfo(oH) || {};
      opts.push({
        h: oH,
        p: (typeof rawOpt === 'object' && rawOpt.p) ? rawOpt.p : (fbInfo.p || ''),
        m: (typeof rawOpt === 'object' && rawOpt.m) ? rawOpt.m : (fbInfo.m || '')
      });
    });
  }

  var poolDistractors = validDeck.filter(function(w) {
    return w && getCleanHanzi(w.h) !== getCleanHanzi(targetCleanH);
  });
  // If validDeck has fewer than 4 words, supplement from DATA
  if (poolDistractors.length < 3 && typeof DATA !== 'undefined' && DATA['HSK 1']) {
    DATA['HSK 1'].forEach(function(w) {
      if (w && getCleanHanzi(w.h) !== getCleanHanzi(targetCleanH)) {
        poolDistractors.push(w);
      }
    });
  }
  shuffle(poolDistractors);
  for (var i = 0; i < poolDistractors.length && opts.length < 4; i++) {
    var d = poolDistractors[i];
    if (!opts.some(function(o) { return getCleanHanzi(o.h) === getCleanHanzi(d.h); })) {
      opts.push(d);
    }
  }
  shuffle(opts);
  sFillOptions = opts;

  optsBox.innerHTML = '';
  opts.forEach(function(opt, optIdx) {
    var btn = document.createElement('div');
    btn.className = 'q-opt s-fill-opt';
    var cleanH = getCleanHanzi(opt.h);
    btn.innerHTML =
      '<div class="s-opt-hanzi">' + cleanH + '</div>' +
      '<div class="s-opt-hint-label">Trỏ vào để xem Pinyin</div>';
    bindTooltipEvents(btn, function() {
      var fallback = lookupWordInfo(cleanH) || {};
      return {
        info: {
          h: cleanH,
          p: opt.p || fallback.p || '',
          m: opt.m || fallback.m || ''
        },
        opts: { hideMeaning: !sAnswered }
      };
    });
    btn.onclick = function() {
      hideWordTooltip();
      answerFillQuestion(optIdx);
    };
    optsBox.appendChild(btn);
  });
}

function answerFillQuestion(optIdx) {
  if (sAnswered || !sCur) return;
  sAnswered = true;
  sTotal++;

  var chosen = sFillOptions[optIdx];
  var expectedH = sTargetMatch || getCleanHanzi(sCur.h);
  var isCorrect = getCleanHanzi(chosen.h) === getCleanHanzi(expectedH);

  var optEls = document.querySelectorAll('#sFillOpts .q-opt');
  optEls.forEach(function(el, idx) {
    el.classList.add('disabled');
    var o = sFillOptions[idx];
    var subEl = el.querySelector('.s-opt-hint-label');
    if (subEl && o) {
      subEl.textContent = (o.p || '') + (o.m ? ' — ' + o.m : '');
      subEl.classList.add('revealed');
    }
  });

  var slotEl = document.getElementById('sBlankSlot');
  if (slotEl) {
    slotEl.textContent = sTargetMatch;
    slotEl.classList.add(isCorrect ? 'filled-correct' : 'filled-wrong');
    bindTooltipEvents(slotEl, function() {
      return {
        info: {
          h: sTargetMatch,
          p: sCur.p || '',
          m: sCur.m || ''
        }
      };
    });
  }

  if (isCorrect) {
    sScore++;
    if (optEls[optIdx]) optEls[optIdx].classList.add('correct');
  } else {
    requeueWordForReview(sCur);
    if (optEls[optIdx]) optEls[optIdx].classList.add('wrong');
    sFillOptions.forEach(function(o, i) {
      if (getCleanHanzi(o.h) === getCleanHanzi(expectedH) && optEls[i]) {
        optEls[i].classList.add('correct');
      }
    });
  }

  updateScoreUI();
  recordSentenceSRS(getCleanHanzi(sCur.h), isCorrect);
  showFeedback(isCorrect);
  if (typeof speak === 'function') speak(sCur.ex);
}

// ==================== HINT BUTTON ====================
function useSentenceHint() {
  if (sAnswered || !sCur) return;

  if (sActiveSubMode === 'arrange') {
    // Find first index where user's answer differs from sTargetTokens
    var matchLen = 0;
    while (
      matchLen < sAnswerItems.length &&
      matchLen < sTargetTokens.length &&
      sAnswerItems[matchLen].text === sTargetTokens[matchLen]
    ) {
      matchLen++;
    }
    // Remove any wrong trailing tiles
    while (sAnswerItems.length > matchLen) {
      removeTileFromAnswer(sAnswerItems.length - 1);
    }
    // Add the next correct token from sBankItems
    if (matchLen < sTargetTokens.length) {
      var neededText = sTargetTokens[matchLen];
      var candidate = sBankItems.find(function(b) { return !b.used && b.text === neededText; });
      if (candidate) {
        addTileToAnswer(candidate.id);
      }
    }
    if (sCur.exp && window.showToast) {
      showToast('💡 Pinyin: ' + sCur.exp, 'info');
    }
  } else {
    // Fill mode: reveal sentence pinyin and disable 1 wrong option
    var pinyinEl = document.getElementById('sClozePinyin');
    if (pinyinEl && sCur.exp) {
      pinyinEl.style.display = 'block';
    }
    var optEls = document.querySelectorAll('#sFillOpts .q-opt');
    for (var i = 0; i < sFillOptions.length; i++) {
      if (getCleanHanzi(sFillOptions[i].h) !== getCleanHanzi(sCur.h) &&
          optEls[i] && !optEls[i].classList.contains('disabled')) {
        optEls[i].classList.add('disabled');
        break;
      }
    }
    if (window.showToast) {
      showToast('💡 Từ cần điền có Pinyin: ' + (sCur.p || ''), 'info');
    }
  }
}

// ==================== FEEDBACK & SRS ====================
function showFeedback(isCorrect) {
  var feedbackEl = document.getElementById('sFeedback');
  var titleEl = document.getElementById('sResultTitle');
  var hanziEl = document.getElementById('sFullHanzi');
  var pinyinEl = document.getElementById('sFullPinyin');
  var meaningEl = document.getElementById('sFullMeaning');
  if (!feedbackEl || !sCur) return;

  feedbackEl.className = 's-feedback ' + (isCorrect ? 's-feedback-correct' : 's-feedback-wrong');
  if (titleEl) {
    if (isCorrect) {
      titleEl.textContent = '✓ Chính xác! Tuyệt vời!';
      titleEl.style.color = 'var(--neon-green)';
    } else if (sActiveSubMode === 'arrange') {
      var rightCount = 0;
      for (var k = 0; k < sAnswerItems.length; k++) {
        if (sAnswerItems[k].text === sTargetTokens[k]) rightCount++;
      }
      titleEl.innerHTML =
        '<span>✗ Đúng ' + rightCount + '/' + sTargetTokens.length + ' vị trí (🟢 Xanh: Đúng, 🔴 Đỏ: Sai) — Đáp án chuẩn:</span>' +
        '<button type="button" class="s-retry-wrong-btn" id="sRetryWrongBtn">🔧 Sửa lại từ đỏ</button>';
      titleEl.style.color = 'var(--neon-red)';
      var retryBtn = document.getElementById('sRetryWrongBtn');
      if (retryBtn) {
        retryBtn.onclick = function() {
          retryWrongTiles();
        };
      }
    } else {
      titleEl.textContent = '✗ Chưa đúng — Đáp án chuẩn:';
      titleEl.style.color = 'var(--neon-red)';
    }
  }

  if (hanziEl) {
    // Render interactive words inside full sentence with target word highlighted
    var ex = sCur.ex || '';
    hanziEl.innerHTML = '';
    renderInteractiveChineseSpan(hanziEl, ex, sTargetMatch);
  }

  if (pinyinEl) {
    pinyinEl.textContent = sCur.exp || (sCur.p ? sTargetMatch + ': ' + sCur.p : '');
  }

  if (meaningEl) {
    meaningEl.textContent = sCur.exm ? ('🇻🇳 ' + sCur.exm) : ('🇻🇳 ' + sTargetMatch + ': ' + (sCur.m || ''));
  }

  feedbackEl.style.display = 'block';
}

function updateScoreUI() {
  var scoreEl = document.getElementById('sScore');
  if (scoreEl) {
    scoreEl.textContent = 'Điểm: ' + sScore + ' / ' + sTotal;
  }
}

function recordSentenceSRS(wordStr, isCorrect) {
  if (!wordStr) return;
  // Also mark word as learned
  var progress = (window.WQStorage && WQStorage.getProgress()) ||
    JSON.parse(localStorage.getItem('wq_progress')) || {};
  if (!progress.learned) progress.learned = [];
  if (progress.learned.indexOf(wordStr) === -1) {
    progress.learned.push(wordStr);
    if (window.WQStorage) WQStorage.saveProgress(progress);
    else localStorage.setItem('wq_progress', JSON.stringify(progress));
  }

  var srs = (window.WQStorage && WQStorage.getSRS()) ||
    JSON.parse(localStorage.getItem('wq_srs')) || {};
  if (!srs[wordStr]) {
    srs[wordStr] = { reviewCount: 0, interval: 1, nextReview: '' };
  }
  var item = srs[wordStr];
  if (isCorrect) {
    item.reviewCount += 1;
    item.interval = item.reviewCount === 1 ? 1 : item.interval * 2;
  } else {
    item.reviewCount = 0;
    item.interval = 1;
  }
  var nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + item.interval);
  item.nextReview = nextDate.toISOString().split('T')[0];
  srs[wordStr] = item;
  if (window.WQStorage) WQStorage.saveSRS(srs);
  else localStorage.setItem('wq_srs', JSON.stringify(srs));
}

// ==================== DECK SELECTION GRIDS ====================
function renderSentenceHskGrid() {
  var grid = document.getElementById('sentenceHskGrid');
  if (!grid || typeof DATA === 'undefined') return;

  grid.innerHTML = '';
  var colors = [
    'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
    'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
    'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
    'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
  ];

  Object.keys(DATA).forEach(function(lvl, index) {
    var words = DATA[lvl];
    if (!words || words.length === 0) return;
    var sentenceCount = words.filter(function(w) {
      var ew = enrichWord(w);
      return ew && ew.ex;
    }).length;
    if (sentenceCount === 0) return;

    var color = colors[index % colors.length];
    var card = document.createElement('div');
    card.className = 'hsk-card';
    card.style.setProperty('--card-color', color);
    card.innerHTML =
      '<div class="hsk-card-header">' +
        '<h4>' + lvl + '</h4>' +
        '<span class="word-count">' + sentenceCount + ' câu</span>' +
      '</div>' +
      '<div style="margin: 16px 0; color: var(--text-secondary); font-size: 0.9rem;">' +
        'Luyện sắp xếp câu & điền từ với ' + sentenceCount + ' câu mẫu' +
      '</div>' +
      '<button class="btn start-learn-btn" style="background: ' + color + '; border: none; color: #fff;">🧩 Bắt đầu luyện câu</button>';

    card.querySelector('.start-learn-btn').onclick = function() {
      startSentenceWithDeck({ name: lvl, words: words });
    };
    grid.appendChild(card);
  });
}

function renderSentenceCustomDecks() {
  var list = document.getElementById('sentenceCustomDecksList');
  if (!list) return;

  var customDecks = [];
  try {
    customDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
  } catch (e) {
    customDecks = [];
  }

  // Also sync from Cloudflare API so all cloud decks (Bài 4..9, 9) appear even on fresh visit
  if (window.WeiQuanAPI) {
    window.WeiQuanAPI.getDecks('default_user').then(function(res) {
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        var localMap = {};
        customDecks.forEach(function(d) {
          if (d.cloudId) localMap[d.cloudId] = d;
          else if (d.id) localMap[d.id] = d;
        });
        var merged = res.data.map(function(d) {
          var existing = localMap[d.id];
          return {
            id: d.id,
            cloudId: d.id,
            name: d.name,
            words: (existing && existing.words && existing.words.length) ? existing.words : [],
            wordCount: d.word_count || 0,
            createdAt: (d.created_at || '').split(' ')[0].split('T')[0] || ''
          };
        });
        localStorage.setItem('wq_custom_decks', JSON.stringify(merged));
        _renderCustomDeckCards(list, merged);
      } else {
        _renderCustomDeckCards(list, customDecks);
      }
    }).catch(function() {
      _renderCustomDeckCards(list, customDecks);
    });
  } else {
    _renderCustomDeckCards(list, customDecks);
  }
}

function _renderCustomDeckCards(list, customDecks) {
  if (!customDecks || customDecks.length === 0) {
    list.innerHTML =
      '<div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1 / -1;">' +
        'Chưa có bộ từ tự tạo. <a href="custom.html" style="color: var(--accent-purple); text-decoration: underline;">Tạo ngay</a>' +
      '</div>';
    return;
  }

  list.innerHTML = '';
  customDecks.forEach(function(d) {
    var count = d.wordCount || (d.words && d.words.length) || 0;
    var card = document.createElement('div');
    card.className = 'hsk-card';
    card.style.setProperty('--card-color', 'var(--accent-gradient)');
    card.innerHTML =
      '<div class="hsk-card-header">' +
        '<h4>📚 ' + d.name + '</h4>' +
        '<span class="word-count">' + count + ' câu</span>' +
      '</div>' +
      '<div style="margin: 16px 0; color: var(--text-secondary); font-size: 0.85rem;">' +
        '📅 ' + (d.createdAt || 'Đã đồng bộ Cloud') +
      '</div>' +
      '<button class="btn start-learn-btn" style="background: var(--accent-gradient); border: none; color: #fff;">🧩 Luyện câu ngay</button>';

    card.querySelector('.start-learn-btn').onclick = function() {
      var cloudId = d.cloudId || d.id;
      if (cloudId && (!d.words || d.words.length === 0) && window.WeiQuanAPI) {
        if (window.showToast) showToast('⏳ Đang tải bộ từ "' + d.name + '"...', 'info');
        window.WeiQuanAPI.getDeckById(cloudId).then(function(res) {
          if (res && res.success && res.data && res.data.words) {
            d.words = res.data.words.map(enrichWord);
            startSentenceWithDeck({ name: d.name, words: d.words });
          }
        }).catch(function() {
          if (window.showToast) showToast('❌ Không thể tải bộ từ từ Cloud!', 'error');
        });
      } else {
        startSentenceWithDeck({ name: d.name, words: (d.words || []).map(enrichWord) });
      }
    };

    list.appendChild(card);
  });
}

// ==================== START / BACK ====================
function startSentenceWithDeck(deckObj) {
  if (!deckObj || !deckObj.words || deckObj.words.length === 0) {
    if (window.showToast) showToast('Bộ từ đang trống!', 'error');
    return;
  }

  var enrichedWords = deckObj.words.map(enrichWord).filter(function(w) {
    return w && w.h && w.ex;
  });

  if (enrichedWords.length === 0) {
    if (window.showToast) showToast('Bộ từ này chưa có câu ví dụ nào!', 'error');
    return;
  }

  level = deckObj.name;
  deck = deduplicateWords(enrichedWords);
  shuffle(deck);

  sPool = [];
  sAsked = [];
  sScore = 0;
  sTotal = 0;

  if (window.AppState) {
    window.AppState.level = level;
    window.AppState.deck = deck;
  }

  var selSection = document.getElementById('sentenceDeckSelection');
  var gameSection = document.getElementById('sentenceGameSection');
  if (selSection) selSection.style.display = 'none';
  if (gameSection) gameSection.style.display = 'block';

  newSentenceQuestion();
  if (window.showToast) showToast('🧩 Bắt đầu luyện câu "' + deckObj.name + '"!', 'success');
}
window.startSentenceWithDeck = startSentenceWithDeck;

function backToSentenceSelection() {
  var selSection = document.getElementById('sentenceDeckSelection');
  var gameSection = document.getElementById('sentenceGameSection');
  if (selSection) selSection.style.display = 'block';
  if (gameSection) gameSection.style.display = 'none';
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener('DOMContentLoaded', function() {
  // Mode buttons
  document.querySelectorAll('.sentence-mode-btn').forEach(function(btn) {
    btn.onclick = function() {
      document.querySelectorAll('.sentence-mode-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      sMode = btn.dataset.mode;
      localStorage.setItem('wq_sentence_mode', sMode);
      sPool = [];
      sAsked = [];
      sScore = 0;
      sTotal = 0;
      updateScoreUI();
      newSentenceQuestion();
    };
  });

  // Restore saved mode button state
  var savedModeBtn = document.querySelector('.sentence-mode-btn[data-mode="' + sMode + '"]');
  if (savedModeBtn) {
    document.querySelectorAll('.sentence-mode-btn').forEach(function(b) { b.classList.remove('active'); });
    savedModeBtn.classList.add('active');
  }

  var sBackBtn = document.getElementById('sBackBtn');
  if (sBackBtn) sBackBtn.onclick = backToSentenceSelection;

  var sResetBtn = document.getElementById('sResetBtn');
  if (sResetBtn) sResetBtn.onclick = resetArrangeAnswer;

  var sCheckBtn = document.getElementById('sCheckBtn');
  if (sCheckBtn) sCheckBtn.onclick = checkArrangeAnswer;

  var sNextBtn = document.getElementById('sNextBtn');
  if (sNextBtn) sNextBtn.onclick = newSentenceQuestion;

  var sAudioBtn = document.getElementById('sAudioBtn');
  if (sAudioBtn) {
    sAudioBtn.onclick = function() {
      if (sCur && sCur.ex && typeof speak === 'function') {
        speak(sCur.ex);
      }
    };
  }

  var sHintBtn = document.getElementById('sHintBtn');
  if (sHintBtn) sHintBtn.onclick = useSentenceHint;

  // Keyboard support
  document.addEventListener('keydown', function(e) {
    var gameSection = document.getElementById('sentenceGameSection');
    if (!gameSection || gameSection.style.display === 'none') return;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (!sAnswered && sActiveSubMode === 'arrange') {
        checkArrangeAnswer();
      } else if (sAnswered) {
        newSentenceQuestion();
      }
    } else if (e.key === 'Backspace' && !sAnswered && sActiveSubMode === 'arrange') {
      if (sAnswerItems.length > 0) {
        e.preventDefault();
        removeTileFromAnswer(sAnswerItems.length - 1);
      }
    } else if (!sAnswered && sActiveSubMode === 'fill' && ['1', '2', '3', '4'].indexOf(e.key) !== -1) {
      var idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < sFillOptions.length) {
        answerFillQuestion(idx);
      }
    }
  });

  // Check for pending deck from custom.html or flash/quiz completion
  var pendingDeckStr = localStorage.getItem('wq_pending_deck');
  var pendingMode = localStorage.getItem('wq_pending_mode');

  if (pendingDeckStr && (pendingMode === 'sentence' || pendingMode === 'both')) {
    try {
      var pendingDeck = JSON.parse(pendingDeckStr);
      if (typeof DATA !== 'undefined') {
        DATA['custom'] = (pendingDeck.words || []).map(function(w) {
          return typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(w) : w;
        });
      }
      startSentenceWithDeck(pendingDeck);
    } catch (err) {
      console.warn('Failed to parse pending deck for sentence:', err);
      renderSentenceHskGrid();
      renderSentenceCustomDecks();
    }
  } else {
    function tryInitGrids() {
      if (typeof DATA !== 'undefined' && Object.keys(DATA).length > 0) {
        renderSentenceHskGrid();
        renderSentenceCustomDecks();
      } else {
        setTimeout(tryInitGrids, 100);
      }
    }
    tryInitGrids();
  }
});
