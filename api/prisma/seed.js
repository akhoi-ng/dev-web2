require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const img = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=80`;

// key dùng để nối với món ăn bên dưới
const chefs = {
  minh: {
    name: "Nguyễn Văn Minh",
    specialty: "Bếp trưởng món Á",
    imageUrl: img("1583394293214-28ded15ee548"),
  },
  huy: {
    name: "Trần Quốc Huy",
    specialty: "Chuyên gia Steak & Món Âu",
    imageUrl: img("1600565193348-f74bd3c7ccdf"),
  },
  nam: {
    name: "Lê Hoàng Nam",
    specialty: "Bếp trưởng điều hành",
    imageUrl: img("1581299894007-aaa50297cf16"),
  },
  marco: {
    name: "Marco Bianchi",
    specialty: "Bếp món Ý (Pasta & Pizza)",
    imageUrl: img("1577219491135-ce391730fb2c"),
  },
  lucas: {
    name: "Lucas Martin",
    specialty: "Bếp bánh ngọt",
    imageUrl: img("1607631568010-a87245c0daf8"),
  },
};

const ingredients = {
  wagyu: { name: "Thăn bò Wagyu", unit: "kg" },
  thitBo: { name: "Thịt bò thăn (tái)", unit: "kg" },
  xuongBo: { name: "Xương bò", unit: "kg" },
  banhPho: { name: "Bánh phở tươi", unit: "kg" },
  caHoi: { name: "Cá hồi Na Uy", unit: "kg" },
  guanciale: { name: "Thịt má heo guanciale", unit: "gram" },
  spaghetti: { name: "Mỳ spaghetti", unit: "gram" },
  botMi: { name: "Bột mì", unit: "gram" },
  banhMi: { name: "Bánh mì baguette", unit: "ổ" },
  khoaiTay: { name: "Khoai tây", unit: "kg" },
  biDo: { name: "Bí đỏ", unit: "kg" },
  caChua: { name: "Cà chua", unit: "kg" },
  xaLach: { name: "Xà lách romaine", unit: "kg" },
  toi: { name: "Tỏi", unit: "gram" },
  rauThom: { name: "Rau thơm (hành, ngò)", unit: "bó" },
  hungQue: { name: "Rau húng quế", unit: "bó" },
  trung: { name: "Trứng gà", unit: "quả" },
  bo: { name: "Bơ lạt", unit: "gram" },
  kemTuoi: { name: "Kem tươi (whipping cream)", unit: "ml" },
  parmesan: { name: "Phô mai Parmesan", unit: "gram" },
  mozzarella: { name: "Phô mai mozzarella", unit: "gram" },
  mascarpone: { name: "Phô mai mascarpone", unit: "gram" },
  caPhe: { name: "Cà phê Robusta", unit: "gram" },
  suaDac: { name: "Sữa đặc", unit: "ml" },
  cam: { name: "Cam sành", unit: "kg" },
  gao: { name: "Gạo tám thơm", unit: "kg" },
  tom: { name: "Tôm sú", unit: "kg" },
  thitHeo: { name: "Thịt heo ba chỉ", unit: "kg" },
  ga: { name: "Thịt gà ta", unit: "kg" },
  banhTrang: { name: "Bánh tráng", unit: "lá" },
  bun: { name: "Bún tươi", unit: "kg" },
  nuocMam: { name: "Nước mắm Phú Quốc", unit: "ml" },
  dauHu: { name: "Đậu hũ non", unit: "gram" },
  nam: { name: "Nấm đông cô", unit: "gram" },
  chanh: { name: "Chanh tươi", unit: "quả" },
  dua: { name: "Nước cốt dừa", unit: "ml" },
  tra: { name: "Trà xanh", unit: "gram" },
  sua: { name: "Sữa tươi", unit: "ml" },
  socola: { name: "Sô-cô-la đen", unit: "gram" },
  duong: { name: "Đường", unit: "gram" },
  bap: { name: "Bắp ngọt", unit: "quả" },
  rauMuong: { name: "Rau muống", unit: "bó" },
  dauPhong: { name: "Đậu phộng rang", unit: "gram" },
  xoai: { name: "Xoài cát", unit: "kg" },
  duaHau: { name: "Dưa hấu", unit: "kg" },
};

// chef: key trong `chefs`; recipe: [key nguyên liệu, định lượng cho 1 phần]
const dishes = [
  {
    name: "Súp bí đỏ kem tươi",
    description: "Súp bí đỏ nấu nhuyễn cùng kem tươi, rắc hạt bí rang và phô mai feta.",
    price: 65000,
    category: "Khai vị",
    imageUrl: img("1476718406336-bb5a9690ee2a"),
    chef: "nam",
    recipe: [["biDo", 0.2], ["kemTuoi", 50], ["bo", 10]],
  },
  {
    name: "Salad Caesar",
    description: "Xà lách romaine giòn, bánh mì nướng, phô mai Parmesan và sốt Caesar đặc trưng.",
    price: 95000,
    category: "Khai vị",
    imageUrl: img("1550304943-4f24f54ddde9"),
    chef: "huy",
    recipe: [["xaLach", 0.15], ["parmesan", 20], ["banhMi", 0.25], ["trung", 1], ["toi", 5]],
  },
  {
    name: "Phở bò",
    description: "Nước dùng ninh xương bò 12 tiếng, bánh phở mềm, thịt bò tươi cùng rau thơm và chanh.",
    price: 75000,
    category: "Món chính",
    imageUrl: img("1503764654157-72d979d9af2f"),
    chef: "minh",
    recipe: [["xuongBo", 0.5], ["banhPho", 0.2], ["thitBo", 0.1], ["rauThom", 0.2]],
  },
  {
    name: "Bò bít tết Wagyu",
    description: "Thăn bò Wagyu nướng chín vừa, ăn kèm khoai tây chiên và sốt tiêu đen.",
    price: 890000,
    category: "Món chính",
    imageUrl: img("1600891964092-4316c288032e"),
    chef: "huy",
    recipe: [["wagyu", 0.25], ["khoaiTay", 0.2], ["bo", 20], ["toi", 10]],
  },
  {
    name: "Mỳ Ý Carbonara",
    description: "Mỳ spaghetti sốt trứng, phô mai Pecorino và thịt guanciale giòn theo công thức Roma.",
    price: 165000,
    category: "Món chính",
    imageUrl: img("1612874742237-6526221588e3"),
    chef: "marco",
    recipe: [["spaghetti", 120], ["guanciale", 50], ["trung", 2], ["parmesan", 30]],
  },
  {
    name: "Cá hồi áp chảo",
    description: "Phi lê cá hồi Na Uy áp chảo da giòn, rau củ xào bơ và salsa cà chua.",
    price: 285000,
    category: "Món chính",
    imageUrl: img("1467003909585-2f8a72700288"),
    chef: "huy",
    recipe: [["caHoi", 0.2], ["bo", 15], ["caChua", 0.05]],
  },
  {
    name: "Pizza Margherita",
    description: "Đế bánh nướng lò củi, sốt cà chua San Marzano, phô mai mozzarella và lá húng quế.",
    price: 189000,
    category: "Món chính",
    imageUrl: img("1574071318508-1cdbab80d002"),
    available: false,
    chef: "marco",
    recipe: [["botMi", 250], ["caChua", 0.1], ["mozzarella", 125], ["hungQue", 0.1]],
  },
  {
    name: "Khoai tây chiên phô mai",
    description: "Khoai tây chiên giòn rắc phô mai Parmesan và rau mùi tây, ăn kèm các món chính.",
    price: 59000,
    category: "Món phụ",
    imageUrl: img("1573080496219-bb080dd4f877"),
    chef: "nam",
    recipe: [["khoaiTay", 0.25], ["parmesan", 15]],
  },
  {
    name: "Bánh mì bơ tỏi",
    description: "Bánh mì nướng giòn phết bơ tỏi và rau thơm, dùng kèm súp hoặc mỳ Ý.",
    price: 45000,
    category: "Món phụ",
    imageUrl: img("1573140401552-3fab0b24306f"),
    chef: "nam",
    recipe: [["banhMi", 0.5], ["bo", 20], ["toi", 10]],
  },
  {
    name: "Bánh Tiramisu",
    description: "Bánh Tiramisu kiểu Ý với lớp mascarpone mềm mịn, cà phê espresso và bột cacao.",
    price: 85000,
    category: "Tráng miệng",
    imageUrl: img("1571877227200-a0d98ea607e9"),
    chef: "lucas",
    recipe: [["mascarpone", 100], ["caPhe", 15], ["trung", 1], ["kemTuoi", 50]],
  },
  {
    name: "Cà phê sữa đá",
    description: "Cà phê phin Robusta đậm đà pha cùng sữa đặc và đá.",
    price: 45000,
    category: "Đồ uống",
    imageUrl: img("1461023058943-07fcbe16d735"),
    chef: "minh",
    recipe: [["caPhe", 25], ["suaDac", 30]],
  },
  {
    name: "Nước cam ép",
    description: "Cam sành tươi ép nguyên chất, không thêm đường.",
    price: 55000,
    category: "Đồ uống",
    imageUrl: img("1600271886742-f049cd451bba"),
    chef: "nam",
    recipe: [["cam", 0.4]],
  },

  // --- Khai vị ---
  {
    name: "Gỏi cuốn tôm thịt",
    description: "Bánh tráng cuốn tôm, thịt ba chỉ, bún và rau sống, chấm tương đậu phộng.",
    price: 59000,
    category: "Khai vị",
    imageUrl: img("1559847844-5315695dadae"),
    chef: "minh",
    recipe: [["banhTrang", 2], ["tom", 0.05], ["thitHeo", 0.04], ["bun", 0.05], ["rauThom", 0.1]],
  },
  {
    name: "Chả giò hải sản",
    description: "Chả giò chiên giòn nhân tôm, mực và nấm, ăn kèm rau sống và nước mắm chua ngọt.",
    price: 69000,
    category: "Khai vị",
    imageUrl: img("1544025162-d76694265947"),
    chef: "minh",
    recipe: [["banhTrang", 3], ["tom", 0.06], ["nam", 20], ["nuocMam", 15]],
  },
  {
    name: "Bruschetta cà chua",
    description: "Bánh mì nướng giòn phủ cà chua bi, tỏi, húng quế và dầu ô liu.",
    price: 75000,
    category: "Khai vị",
    imageUrl: img("1572695157366-5e585ab2b69f"),
    chef: "marco",
    recipe: [["banhMi", 0.5], ["caChua", 0.1], ["toi", 5], ["hungQue", 0.05]],
  },
  {
    name: "Súp nấm kem",
    description: "Súp nấm đông cô xay mịn với kem tươi và bơ, thơm mùi tiêu đen.",
    price: 69000,
    category: "Khai vị",
    imageUrl: img("1547592166-23ac45744acd"),
    chef: "nam",
    recipe: [["nam", 80], ["kemTuoi", 60], ["bo", 10]],
  },
  {
    name: "Salad cá hồi xông khói",
    description: "Cá hồi xông khói, xà lách, cam và sốt chanh dây thanh mát.",
    price: 129000,
    category: "Khai vị",
    imageUrl: img("1512621776951-a57141f2eefd"),
    chef: "huy",
    recipe: [["caHoi", 0.08], ["xaLach", 0.1], ["cam", 0.1], ["chanh", 1]],
  },

  // --- Món chính ---
  {
    name: "Bún chả Hà Nội",
    description: "Chả viên và thịt ba chỉ nướng than hoa, ăn cùng bún tươi và nước mắm pha.",
    price: 79000,
    category: "Món chính",
    imageUrl: img("1569562211093-4ed0d0758f12"),
    chef: "minh",
    recipe: [["thitHeo", 0.15], ["bun", 0.2], ["nuocMam", 30], ["rauThom", 0.1]],
  },
  {
    name: "Cơm tấm sườn bì chả",
    description: "Sườn nướng mật ong, bì, chả trứng trên nền cơm tấm, rưới mỡ hành.",
    price: 85000,
    category: "Món chính",
    imageUrl: img("1585032226651-759b368d7246"),
    chef: "minh",
    recipe: [["gao", 0.15], ["thitHeo", 0.15], ["trung", 1], ["nuocMam", 20]],
  },
  {
    name: "Bún bò Huế",
    description: "Nước dùng sả ớt đậm vị, bắp bò, giò heo và chả cua đặc trưng xứ Huế.",
    price: 85000,
    category: "Món chính",
    imageUrl: img("1582878826629-29b7ad1cdc43"),
    chef: "minh",
    recipe: [["xuongBo", 0.4], ["thitBo", 0.1], ["bun", 0.2], ["rauThom", 0.1]],
  },
  {
    name: "Gà nướng mật ong",
    description: "Đùi gà ta nướng mật ong và tỏi, ăn kèm khoai tây nướng và salad.",
    price: 159000,
    category: "Món chính",
    imageUrl: img("1598103442097-8b74394b95c6"),
    chef: "nam",
    recipe: [["ga", 0.3], ["toi", 10], ["khoaiTay", 0.15], ["xaLach", 0.05]],
  },
  {
    name: "Cà ri gà nước cốt dừa",
    description: "Cà ri gà kiểu Nam Bộ với khoai lang, nước cốt dừa béo, ăn cùng bánh mì.",
    price: 119000,
    category: "Món chính",
    imageUrl: img("1565557623262-b51c2513a641"),
    chef: "minh",
    recipe: [["ga", 0.25], ["dua", 100], ["khoaiTay", 0.1], ["banhMi", 0.5]],
  },
  {
    name: "Tôm sú nướng bơ tỏi",
    description: "Tôm sú nướng bơ tỏi thơm lừng, rắc rau mùi tây và chanh.",
    price: 245000,
    category: "Món chính",
    imageUrl: img("1565680018434-b513d5e5fd47"),
    chef: "huy",
    recipe: [["tom", 0.3], ["bo", 30], ["toi", 15], ["chanh", 1]],
  },
  {
    name: "Mỳ Ý sốt bò bằm",
    description: "Spaghetti Bolognese với sốt bò bằm hầm cà chua 4 tiếng và phô mai Parmesan.",
    price: 145000,
    category: "Món chính",
    imageUrl: img("1622973536968-3ead9e780960"),
    chef: "marco",
    recipe: [["spaghetti", 120], ["thitBo", 0.1], ["caChua", 0.15], ["parmesan", 20]],
  },
  {
    name: "Risotto nấm",
    description: "Cơm Ý nấu chậm cùng nấm, bơ và Parmesan, kết cấu kem mịn.",
    price: 175000,
    category: "Món chính",
    imageUrl: img("1476124369491-e7addf5db371"),
    chef: "marco",
    recipe: [["gao", 0.1], ["nam", 80], ["bo", 20], ["parmesan", 30]],
  },
  {
    name: "Pizza hải sản",
    description: "Đế mỏng nướng lò củi với tôm, mực, phô mai mozzarella và sốt cà chua.",
    price: 229000,
    category: "Món chính",
    imageUrl: img("1565299624946-b28f40a0ae38"),
    chef: "marco",
    recipe: [["botMi", 250], ["tom", 0.1], ["mozzarella", 125], ["caChua", 0.1]],
  },
  {
    name: "Đậu hũ sốt nấm chay",
    description: "Đậu hũ non chiên vàng sốt nấm đông cô và nước tương, dành cho thực khách ăn chay.",
    price: 79000,
    category: "Món chính",
    imageUrl: img("1546069901-ba9599a7e63c"),
    chef: "nam",
    recipe: [["dauHu", 200], ["nam", 50], ["toi", 5]],
  },

  // --- Món phụ ---
  {
    name: "Cơm chiên trứng",
    description: "Cơm chiên trứng tơi hạt với hành lá, dùng kèm các món chính.",
    price: 49000,
    category: "Món phụ",
    imageUrl: img("1603133872878-684f208fb84b"),
    chef: "minh",
    recipe: [["gao", 0.15], ["trung", 2], ["rauThom", 0.05]],
  },
  {
    name: "Khoai tây nghiền bơ",
    description: "Khoai tây nghiền mịn với bơ và kem tươi kiểu Pháp.",
    price: 55000,
    category: "Món phụ",
    imageUrl: img("1600175074394-5d23b3ec8fbc"),
    chef: "huy",
    recipe: [["khoaiTay", 0.2], ["bo", 20], ["kemTuoi", 30]],
  },
  {
    name: "Rau củ nướng thảo mộc",
    description: "Bí đỏ, cà chua và nấm nướng với dầu ô liu và thảo mộc.",
    price: 59000,
    category: "Món phụ",
    imageUrl: img("1540420773420-3366772f4999"),
    chef: "nam",
    recipe: [["biDo", 0.1], ["caChua", 0.08], ["nam", 40]],
  },

  // --- Tráng miệng ---
  {
    name: "Bánh flan caramel",
    description: "Bánh flan mềm mịn với lớp caramel đắng nhẹ và cà phê.",
    price: 39000,
    category: "Tráng miệng",
    imageUrl: img("1528975604071-b4dc52a2d18c"),
    chef: "lucas",
    recipe: [["trung", 2], ["sua", 150], ["duong", 30]],
  },
  {
    name: "Chè dừa dầm",
    description: "Thạch dừa, cơm dừa non và nước cốt dừa mát lạnh.",
    price: 45000,
    category: "Tráng miệng",
    imageUrl: img("1563805042-7684c019e1cb"),
    chef: "minh",
    recipe: [["dua", 120], ["duong", 25]],
  },
  {
    name: "Bánh sô-cô-la tan chảy",
    description: "Lava cake nhân sô-cô-la đen nóng chảy, ăn kèm kem vani.",
    price: 95000,
    category: "Tráng miệng",
    imageUrl: img("1606313564200-e75d5e30476c"),
    chef: "lucas",
    recipe: [["socola", 60], ["bo", 30], ["trung", 1], ["botMi", 20]],
  },
  {
    name: "Panna cotta dâu",
    description: "Panna cotta kem sữa kiểu Ý với sốt dâu tây tươi.",
    price: 79000,
    category: "Tráng miệng",
    imageUrl: img("1488477181946-6428a0291777"),
    chef: "lucas",
    recipe: [["kemTuoi", 120], ["sua", 50], ["duong", 20]],
  },

  // --- Đồ uống ---
  {
    name: "Trà chanh sả",
    description: "Trà xanh pha chanh tươi và sả đập dập, mát lạnh giải nhiệt.",
    price: 35000,
    category: "Đồ uống",
    imageUrl: img("1556679343-c7306c1976bc"),
    chef: "nam",
    recipe: [["tra", 5], ["chanh", 1], ["duong", 15]],
  },
  {
    name: "Nước dừa tươi",
    description: "Dừa xiêm Bến Tre nguyên trái, ngọt thanh tự nhiên.",
    price: 40000,
    category: "Đồ uống",
    imageUrl: img("1525385133512-2f3bdd039054"),
    chef: "nam",
    recipe: [["dua", 300]],
  },
  {
    name: "Matcha latte",
    description: "Bột trà xanh Nhật đánh cùng sữa tươi, dùng nóng hoặc đá.",
    price: 59000,
    category: "Đồ uống",
    imageUrl: img("1515823064-d6e0c04616a7"),
    chef: "lucas",
    recipe: [["tra", 4], ["sua", 200], ["duong", 10]],
  },

  // --- Bổ sung để mỗi danh mục có ít nhất 9 món ---
  // Khai vị
  {
    name: "Gỏi gà hành tây",
    description: "Gà ta xé trộn hành tây, rau răm, đậu phộng rang và nước mắm chua ngọt.",
    price: 89000,
    category: "Khai vị",
    imageUrl: img("1546793665-c74683f339c1"),
    chef: "minh",
    recipe: [["ga", 0.15], ["rauThom", 0.1], ["dauPhong", 20], ["nuocMam", 15], ["chanh", 1]],
  },
  {
    name: "Súp bắp cua",
    description: "Súp bắp ngọt nấu cùng trứng gà và nấm, sánh nhẹ, thơm tiêu.",
    price: 55000,
    category: "Khai vị",
    imageUrl: img("1547592180-85f173990554"),
    chef: "nam",
    recipe: [["bap", 1], ["trung", 1], ["nam", 20]],
  },

  // Món phụ
  {
    name: "Rau muống xào tỏi",
    description: "Rau muống xào lửa lớn với tỏi phi giòn, giữ màu xanh và độ giòn.",
    price: 45000,
    category: "Món phụ",
    imageUrl: img("1540189549336-e6e99c3679fe"),
    chef: "minh",
    recipe: [["rauMuong", 1], ["toi", 15], ["nuocMam", 10]],
  },
  {
    name: "Bắp nướng mỡ hành",
    description: "Bắp ngọt nướng than, phết mỡ hành và rắc đậu phộng.",
    price: 35000,
    category: "Món phụ",
    imageUrl: img("1551754655-cd27e38d2076"),
    chef: "nam",
    recipe: [["bap", 1], ["rauThom", 0.05], ["dauPhong", 15]],
  },
  {
    name: "Salad trộn dầu giấm",
    description: "Xà lách, cà chua bi và hành tây trộn sốt dầu giấm nhẹ.",
    price: 49000,
    category: "Món phụ",
    imageUrl: img("1512621776951-a57141f2eefd"),
    chef: "huy",
    recipe: [["xaLach", 0.1], ["caChua", 0.05], ["chanh", 1]],
  },
  {
    name: "Cơm trắng",
    description: "Cơm gạo tám thơm dẻo, dùng kèm các món chính.",
    price: 15000,
    category: "Món phụ",
    imageUrl: img("1516684732162-798a0062be99"),
    chef: "minh",
    recipe: [["gao", 0.12]],
  },

  // Tráng miệng
  {
    name: "Chè xoài nước cốt dừa",
    description: "Xoài cát chín cắt hạt lựu, nước cốt dừa và trân châu.",
    price: 49000,
    category: "Tráng miệng",
    imageUrl: img("1546039907-7fa05f864c02"),
    chef: "minh",
    recipe: [["xoai", 0.15], ["dua", 80], ["duong", 15]],
  },
  {
    name: "Kem sô-cô-la",
    description: "Hai viên kem sô-cô-la đen tự làm, rắc hạt hạnh nhân.",
    price: 55000,
    category: "Tráng miệng",
    imageUrl: img("1497034825429-c343d7c6a68f"),
    chef: "lucas",
    recipe: [["socola", 40], ["kemTuoi", 80], ["sua", 50], ["duong", 20]],
  },
  {
    name: "Bánh crème brûlée",
    description: "Kem trứng kiểu Pháp với lớp đường khò giòn tan phía trên.",
    price: 85000,
    category: "Tráng miệng",
    imageUrl: img("1470124182917-cc6e71b22ecc"),
    chef: "lucas",
    recipe: [["kemTuoi", 120], ["trung", 2], ["duong", 30]],
  },
  {
    name: "Bánh cheesecake chanh",
    description: "Cheesecake nướng mềm mịn với vỏ bánh quy bơ và sốt chanh.",
    price: 89000,
    category: "Tráng miệng",
    imageUrl: img("1565958011703-44f9829ba187"),
    chef: "lucas",
    recipe: [["mascarpone", 100], ["bo", 20], ["botMi", 30], ["trung", 1], ["chanh", 1]],
  },

  // Đồ uống
  {
    name: "Sinh tố xoài",
    description: "Xoài cát xay cùng sữa tươi và đá, sánh mịn.",
    price: 49000,
    category: "Đồ uống",
    imageUrl: img("1546173159-315724a31696"),
    chef: "nam",
    recipe: [["xoai", 0.2], ["sua", 100], ["duong", 10]],
  },
  {
    name: "Nước ép dưa hấu",
    description: "Dưa hấu tươi ép lạnh, ngọt mát tự nhiên.",
    price: 45000,
    category: "Đồ uống",
    imageUrl: img("1497534446932-c925b458314e"),
    chef: "nam",
    recipe: [["duaHau", 0.4]],
  },
  {
    name: "Cà phê muối",
    description: "Cà phê phin phủ lớp kem sữa mằn mặn béo ngậy kiểu Huế.",
    price: 49000,
    category: "Đồ uống",
    imageUrl: img("1509042239860-f550ce710b93"),
    chef: "minh",
    recipe: [["caPhe", 25], ["kemTuoi", 40], ["suaDac", 20]],
  },
  {
    name: "Sô-cô-la nóng",
    description: "Sô-cô-la đen đun cùng sữa tươi, phủ kem tươi đánh bông.",
    price: 55000,
    category: "Đồ uống",
    imageUrl: img("1542990253-0d0f5be5f0ed"),
    chef: "lucas",
    recipe: [["socola", 40], ["sua", 200], ["kemTuoi", 20]],
  },
];

async function main() {
  // Xóa theo thứ tự: bảng nối trước, rồi tới các bảng chính
  await prisma.booking.deleteMany();
  await prisma.dishIngredient.deleteMany();
  await prisma.dish.deleteMany();
  await prisma.chef.deleteMany();
  await prisma.ingredient.deleteMany();

  const chefIds = {};
  for (const [key, data] of Object.entries(chefs)) {
    chefIds[key] = (await prisma.chef.create({ data })).id;
  }

  const ingredientIds = {};
  for (const [key, data] of Object.entries(ingredients)) {
    ingredientIds[key] = (await prisma.ingredient.create({ data })).id;
  }

  for (const { chef, recipe, ...dish } of dishes) {
    await prisma.dish.create({
      data: {
        ...dish,
        chefId: chefIds[chef],
        ingredients: {
          create: recipe.map(([key, quantity]) => ({
            ingredientId: ingredientIds[key],
            quantity,
          })),
        },
      },
    });
  }

  console.log(
    `Seed xong: ${dishes.length} món ăn, ${Object.keys(chefs).length} đầu bếp, ` +
      `${Object.keys(ingredients).length} nguyên liệu.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
