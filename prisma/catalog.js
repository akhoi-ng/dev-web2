// Dữ liệu mẫu của thực đơn: món viết tay (Block 5–6) + món sinh tự động cho đủ 1.500 món (Block 7).
// Thuần dữ liệu, không chạm database: seed.js đọc buildCatalog() để ghi vào DB.

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
const baseDishes = [
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
/* ---------------- Block 7: sinh thêm món để thực đơn đủ 1.500 món ---------------- */

const TOTAL_DISHES = 1500;

// Nguyên liệu bổ sung cho các món sinh tự động (đơn vị thuộc INGREDIENT_UNITS)
const extraIngredients = {
  muc: { name: "Mực ống", unit: "kg" },
  cua: { name: "Thịt cua", unit: "kg" },
  ngheu: { name: "Nghêu", unit: "kg" },
  caBasa: { name: "Cá basa phi lê", unit: "kg" },
  caThu: { name: "Cá thu", unit: "kg" },
  vit: { name: "Thịt vịt", unit: "kg" },
  suonHeo: { name: "Sườn heo non", unit: "kg" },
  thitBam: { name: "Thịt heo xay", unit: "kg" },
  thitCuu: { name: "Sườn cừu", unit: "kg" },
  xucXich: { name: "Xúc xích Đức", unit: "gram" },
  bacon: { name: "Ba chỉ xông khói (bacon)", unit: "gram" },
  trungCut: { name: "Trứng cút", unit: "quả" },
  sa: { name: "Sả cây", unit: "bó" },
  ot: { name: "Ớt hiểm", unit: "gram" },
  gung: { name: "Gừng", unit: "gram" },
  hanhTay: { name: "Hành tây", unit: "kg" },
  hanhLa: { name: "Hành lá", unit: "bó" },
  tieu: { name: "Tiêu đen", unit: "gram" },
  que: { name: "Quế thanh", unit: "gram" },
  hoi: { name: "Hoa hồi", unit: "gram" },
  nghe: { name: "Nghệ tươi", unit: "gram" },
  caRot: { name: "Cà rốt", unit: "kg" },
  dauHaLan: { name: "Đậu Hà Lan", unit: "gram" },
  bongCai: { name: "Bông cải xanh", unit: "kg" },
  caiThia: { name: "Cải thìa", unit: "kg" },
  gia: { name: "Giá đỗ", unit: "kg" },
  duaLeo: { name: "Dưa leo", unit: "kg" },
  khoaiLang: { name: "Khoai lang", unit: "kg" },
  khoaiMon: { name: "Khoai môn", unit: "kg" },
  namRom: { name: "Nấm rơm", unit: "gram" },
  namKim: { name: "Nấm kim châm", unit: "gram" },
  oliu: { name: "Dầu ô liu", unit: "ml" },
  dauAn: { name: "Dầu ăn", unit: "ml" },
  nuocTuong: { name: "Nước tương", unit: "ml" },
  dauHao: { name: "Dầu hào", unit: "ml" },
  giam: { name: "Giấm gạo", unit: "ml" },
  matOng: { name: "Mật ong", unit: "ml" },
  cheddar: { name: "Phô mai cheddar", unit: "gram" },
  penne: { name: "Mỳ penne", unit: "gram" },
  miTrung: { name: "Mì trứng", unit: "gram" },
  huTieu: { name: "Hủ tiếu khô", unit: "gram" },
  mien: { name: "Miến dong", unit: "gram" },
  dauXanh: { name: "Đậu xanh", unit: "gram" },
  dauDo: { name: "Đậu đỏ", unit: "gram" },
  botNang: { name: "Bột năng", unit: "gram" },
  thachDua: { name: "Thạch dừa", unit: "gram" },
  dauTay: { name: "Dâu tây", unit: "kg" },
  chuoi: { name: "Chuối sứ", unit: "kg" },
  traiBo: { name: "Trái bơ sáp", unit: "kg" },
  chanhDay: { name: "Chanh dây", unit: "quả" },
  thom: { name: "Thơm (dứa)", unit: "quả" },
  tranChau: { name: "Trân châu", unit: "gram" },
  traDen: { name: "Trà đen", unit: "gram" },
  cacao: { name: "Bột cacao", unit: "gram" },
  suaChua: { name: "Sữa chua", unit: "hộp" },
  vani: { name: "Vani", unit: "gram" },
  dao: { name: "Đào ngâm", unit: "hộp" },
  oi: { name: "Ổi", unit: "kg" },
};

/*
 * Mẫu món: tên gốc + các biến thể. Mỗi biến thể: [hậu tố tên, [[nguyên liệu, định lượng]...], chênh giá].
 * Tên món = "<gốc> <hậu tố>[ <phong cách>][ (<khẩu phần>)]".
 */
const T = (base, category, chef, price, core, variants) => ({ base, category, chef, price, core, variants });
const templates = [
  // --- Khai vị ---
  T("Gỏi cuốn", "Khai vị", "minh", 55000, [["banhTrang", 2], ["bun", 0.05], ["rauThom", 0.05]], [
    ["tôm", [["tom", 0.05]], 5000], ["thịt", [["thitHeo", 0.05]], 0], ["gà", [["ga", 0.05]], 0],
    ["chay", [["dauHu", 80]], -10000], ["cá hồi", [["caHoi", 0.05]], 25000], ["bò", [["thitBo", 0.05]], 10000],
    ["mực", [["muc", 0.05]], 8000], ["nấm", [["namRom", 40]], -5000],
  ]),
  T("Chả giò", "Khai vị", "minh", 65000, [["banhTrang", 3], ["caRot", 0.03], ["mien", 10]], [
    ["tôm", [["tom", 0.06]], 5000], ["thịt", [["thitBam", 0.06]], 0], ["cua", [["cua", 0.05]], 20000],
    ["chay", [["namKim", 40]], -10000], ["mực", [["muc", 0.05]], 8000], ["gà", [["ga", 0.06]], 0],
  ]),
  T("Súp", "Khai vị", "nam", 55000, [["botNang", 10], ["trung", 1]], [
    ["cua", [["cua", 0.05]], 15000], ["gà xé", [["ga", 0.05]], 0], ["nấm đông cô", [["nam", 40]], 0],
    ["hải sản", [["tom", 0.04], ["muc", 0.03]], 15000], ["bắp gà", [["bap", 1], ["ga", 0.03]], 0],
    ["rau củ", [["caRot", 0.05], ["dauHaLan", 20]], -5000], ["trứng cút", [["trungCut", 4]], 0],
  ]),
  T("Salad", "Khai vị", "huy", 79000, [["xaLach", 0.1], ["caChua", 0.05], ["oliu", 15]], [
    ["cá thu", [["caThu", 0.08]], 20000], ["gà nướng", [["ga", 0.08]], 10000], ["bơ sáp", [["traiBo", 0.1]], 10000],
    ["trứng", [["trung", 1]], 0], ["tôm", [["tom", 0.06]], 20000], ["cá hồi", [["caHoi", 0.06]], 40000],
    ["rau củ", [["duaLeo", 0.05], ["caRot", 0.03]], -10000], ["xoài", [["xoai", 0.1]], 0],
  ]),
  T("Gỏi", "Khai vị", "minh", 75000, [["rauThom", 0.05], ["nuocMam", 15], ["dauPhong", 10]], [
    ["gà xé phay", [["ga", 0.1], ["hanhTay", 0.03]], 10000], ["bò tái chanh", [["thitBo", 0.1], ["chanh", 1]], 20000],
    ["mực", [["muc", 0.1]], 15000], ["tôm thịt", [["tom", 0.05], ["thitHeo", 0.05]], 15000],
    ["xoài xanh", [["xoai", 0.15]], -10000], ["dưa leo", [["duaLeo", 0.15]], -15000], ["rau muống", [["rauMuong", 0.2]], -15000],
  ]),
  T("Đậu hũ chiên", "Khai vị", "nam", 45000, [["dauHu", 150], ["dauAn", 20]], [
    ["sả ớt", [["sa", 0.05], ["ot", 5]], 0], ["muối tiêu", [["tieu", 3]], 0], ["sốt cà", [["caChua", 0.08]], 5000],
    ["nước tương", [["nuocTuong", 20]], 0], ["mỡ hành", [["hanhLa", 0.05]], 0],
  ]),
  T("Mực chiên", "Khai vị", "minh", 115000, [["muc", 0.15], ["botMi", 30], ["dauAn", 30]], [
    ["giòn", [], 0], ["nước mắm", [["nuocMam", 20]], 0], ["sả ớt", [["sa", 0.05], ["ot", 5]], 5000],
    ["muối tiêu", [["tieu", 3]], 0], ["bơ tỏi", [["bo", 15], ["toi", 10]], 5000],
  ]),

  // --- Món chính ---
  T("Phở", "Món chính", "minh", 75000, [["banhPho", 0.2], ["xuongBo", 0.3], ["rauThom", 0.05], ["hanhLa", 0.05]], [
    ["bò tái", [["thitBo", 0.1]], 0], ["bò chín", [["thitBo", 0.1]], 0], ["gà", [["ga", 0.1]], -5000],
    ["bò viên", [["thitBo", 0.08]], 0], ["tái nạm", [["thitBo", 0.12]], 10000], ["bò đặc biệt", [["thitBo", 0.15]], 20000],
    ["gà xé", [["ga", 0.1]], -5000], ["chay", [["namRom", 60]], -15000],
  ]),
  T("Bún", "Món chính", "minh", 75000, [["bun", 0.2], ["rauThom", 0.05]], [
    ["bò Huế", [["thitBo", 0.1], ["sa", 0.05]], 10000], ["riêu cua", [["cua", 0.05], ["caChua", 0.05]], 5000],
    ["chả cá", [["caThu", 0.1]], 10000], ["thịt nướng", [["thitHeo", 0.12]], 0], ["gà", [["ga", 0.1]], 0],
    ["mọc", [["thitBam", 0.1]], 0], ["nghêu", [["ngheu", 0.15]], 5000], ["măng vịt", [["vit", 0.15]], 15000],
  ]),
  T("Cơm", "Món chính", "minh", 79000, [["gao", 0.15]], [
    ["sườn nướng", [["suonHeo", 0.2]], 10000], ["gà xối mỡ", [["ga", 0.2], ["dauAn", 20]], 5000],
    ["chiên hải sản", [["tom", 0.05], ["muc", 0.05], ["trung", 1]], 15000],
    ["chiên Dương Châu", [["trung", 1], ["xucXich", 40], ["dauHaLan", 20]], 0],
    ["bò lúc lắc", [["thitBo", 0.15], ["hanhTay", 0.05]], 40000], ["cá kho tộ", [["caBasa", 0.15], ["nuocMam", 20]], 5000],
    ["thịt kho trứng", [["thitHeo", 0.15], ["trung", 1]], 0], ["vịt quay", [["vit", 0.2]], 20000],
    ["gà Hải Nam", [["ga", 0.2], ["gung", 10]], 10000],
  ]),
  T("Mỳ Ý", "Món chính", "marco", 145000, [["spaghetti", 120], ["oliu", 10]], [
    ["sốt kem nấm", [["kemTuoi", 60], ["nam", 50]], 10000], ["hải sản", [["tom", 0.06], ["muc", 0.05]], 40000],
    ["cà chua húng quế", [["caChua", 0.15], ["hungQue", 0.05]], -10000], ["bò bằm", [["thitBam", 0.1], ["caChua", 0.1]], 0],
    ["xúc xích", [["xucXich", 60]], 0], ["cá hồi", [["caHoi", 0.1], ["kemTuoi", 40]], 50000],
    ["bacon", [["bacon", 50], ["trung", 1]], 10000], ["sốt pesto", [["hungQue", 0.1], ["parmesan", 20]], 5000],
  ]),
  T("Mỳ penne", "Món chính", "marco", 139000, [["penne", 120], ["oliu", 10]], [
    ["sốt cà chua", [["caChua", 0.15]], -10000], ["gà sốt kem", [["ga", 0.1], ["kemTuoi", 50]], 10000],
    ["bò bằm phô mai", [["thitBam", 0.1], ["mozzarella", 40]], 15000], ["rau củ", [["bongCai", 0.05], ["caRot", 0.05]], -15000],
  ]),
  T("Pizza", "Món chính", "marco", 199000, [["botMi", 250], ["mozzarella", 120], ["caChua", 0.1]], [
    ["bò", [["thitBo", 0.1]], 30000], ["gà BBQ", [["ga", 0.1]], 10000], ["xúc xích", [["xucXich", 80]], 0],
    ["nấm", [["nam", 60]], -10000], ["bốn loại phô mai", [["cheddar", 50], ["parmesan", 30]], 30000],
    ["Hawaii", [["thom", 0.5], ["bacon", 50]], 10000], ["rau củ", [["bongCai", 0.05], ["hanhTay", 0.05]], -20000],
    ["tôm", [["tom", 0.1]], 30000],
  ]),
  T("Hủ tiếu", "Món chính", "minh", 69000, [["huTieu", 100], ["xuongBo", 0.2]], [
    ["Nam Vang", [["tom", 0.05], ["thitBam", 0.05]], 10000], ["bò kho", [["thitBo", 0.12], ["caRot", 0.05]], 15000],
    ["xào", [["caiThia", 0.05]], 0], ["hải sản", [["muc", 0.05], ["tom", 0.05]], 20000], ["gà", [["ga", 0.1]], 0],
  ]),
  T("Mì xào", "Món chính", "minh", 79000, [["miTrung", 100], ["caiThia", 0.05], ["dauHao", 10]], [
    ["bò", [["thitBo", 0.1]], 15000], ["hải sản", [["tom", 0.05], ["muc", 0.05]], 20000], ["gà", [["ga", 0.1]], 5000],
    ["giòn thập cẩm", [["tom", 0.03], ["thitHeo", 0.05]], 15000], ["chay", [["namKim", 60]], -10000],
  ]),
  T("Lẩu", "Món chính", "nam", 299000, [["rauMuong", 0.2], ["namKim", 100], ["bun", 0.2]], [
    ["Thái", [["tom", 0.15], ["sa", 0.1]], 50000], ["gà", [["ga", 0.5]], 0], ["bò", [["thitBo", 0.3]], 50000],
    ["hải sản", [["muc", 0.2], ["ngheu", 0.3]], 80000], ["nấm chay", [["namRom", 200]], -50000],
    ["cá", [["caBasa", 0.4]], 0], ["riêu cua", [["cua", 0.2], ["caChua", 0.15]], 30000],
  ]),
  T("Bò", "Món chính", "huy", 189000, [["thitBo", 0.2], ["toi", 5]], [
    ["bít tết sốt tiêu", [["tieu", 5], ["khoaiTay", 0.15]], 60000], ["lúc lắc", [["hanhTay", 0.05]], 20000],
    ["nướng sả", [["sa", 0.05]], 0], ["xào bông cải", [["bongCai", 0.1]], -20000], ["hầm tiêu xanh", [["tieu", 5], ["caRot", 0.1]], 0],
    ["kho gừng", [["gung", 10], ["nuocMam", 20]], -10000],
  ]),
  T("Gà", "Món chính", "nam", 149000, [["ga", 0.3]], [
    ["nướng mật ong", [["matOng", 30], ["toi", 10]], 10000], ["chiên nước mắm", [["nuocMam", 30], ["dauAn", 30]], 0],
    ["kho gừng", [["gung", 15]], -10000], ["nướng sả ớt", [["sa", 0.05], ["ot", 5]], 0], ["hấp hành", [["hanhLa", 0.1]], -10000],
    ["rô ti", [["nuocTuong", 30]], 0], ["cà ri cốt dừa", [["dua", 100], ["khoaiLang", 0.1]], 10000],
  ]),
  T("Cá", "Món chính", "huy", 159000, [["chanh", 1]], [
    ["hồi áp chảo sốt bơ", [["caHoi", 0.2], ["bo", 20]], 120000], ["thu sốt cà", [["caThu", 0.2], ["caChua", 0.1]], 0],
    ["basa chiên giòn", [["caBasa", 0.2], ["botMi", 30]], -30000], ["basa kho tộ", [["caBasa", 0.2], ["nuocMam", 30]], -30000],
    ["thu chiên sả", [["caThu", 0.2], ["sa", 0.05]], 0], ["hồi sốt teriyaki", [["caHoi", 0.2], ["nuocTuong", 20]], 110000],
    ["basa hấp gừng", [["caBasa", 0.2], ["gung", 15]], -30000],
  ]),
  T("Tôm", "Món chính", "huy", 219000, [["tom", 0.25]], [
    ["rang muối", [["tieu", 5]], 0], ["hấp sả", [["sa", 0.1]], -10000], ["chiên xù", [["botMi", 50], ["trung", 1]], 0],
    ["nướng phô mai", [["mozzarella", 60]], 20000], ["xào bông cải", [["bongCai", 0.1]], -10000],
    ["sốt chanh dây", [["chanhDay", 2]], 10000],
  ]),
  T("Sườn", "Món chính", "minh", 159000, [["suonHeo", 0.3]], [
    ["nướng mật ong", [["matOng", 30]], 10000], ["ram mặn", [["nuocMam", 30]], 0], ["xào chua ngọt", [["thom", 0.3], ["giam", 20]], 0],
    ["nướng BBQ", [["tieu", 5], ["toi", 10]], 20000], ["non rim sả", [["sa", 0.05]], 0],
  ]),
  T("Vịt", "Món chính", "minh", 189000, [["vit", 0.3]], [
    ["quay mật ong", [["matOng", 30]], 30000], ["om khoai môn", [["khoaiMon", 0.15], ["dua", 80]], 0],
    ["nướng tiêu", [["tieu", 5]], 10000], ["xào gừng", [["gung", 20]], -10000],
  ]),
  T("Cừu", "Món chính", "huy", 389000, [["thitCuu", 0.3]], [
    ["nướng thảo mộc", [["rauThom", 0.05], ["oliu", 20]], 0], ["nướng tỏi", [["toi", 15]], 0], ["hầm rau củ", [["caRot", 0.1], ["khoaiTay", 0.1]], -30000],
  ]),
  T("Đậu hũ", "Món chính", "nam", 75000, [["dauHu", 200]], [
    ["kho nấm rơm", [["namRom", 80]], 0], ["sốt cà chua", [["caChua", 0.1]], -5000], ["xào sả ớt", [["sa", 0.05], ["ot", 5]], 0],
    ["non tứ xuyên", [["ot", 10], ["thitBam", 0.05]], 10000],
  ]),
  T("Risotto", "Món chính", "marco", 175000, [["gao", 0.1], ["parmesan", 20], ["bo", 15]], [
    ["nấm", [["nam", 80]], 0], ["hải sản", [["tom", 0.06], ["muc", 0.05]], 40000], ["bí đỏ", [["biDo", 0.15]], -10000],
    ["gà", [["ga", 0.1]], 10000],
  ]),
  T("Cà ri", "Món chính", "minh", 119000, [["dua", 100], ["khoaiLang", 0.1], ["sa", 0.05]], [
    ["gà", [["ga", 0.25]], 0], ["bò", [["thitBo", 0.2]], 30000], ["tôm", [["tom", 0.15]], 40000],
    ["chay", [["dauHu", 150], ["namRom", 50]], -20000], ["vịt", [["vit", 0.25]], 20000],
  ]),

  // --- Món phụ ---
  T("Rau", "Món phụ", "minh", 45000, [["toi", 5], ["dauAn", 10]], [
    ["muống xào tỏi", [["rauMuong", 0.25]], 0], ["cải thìa xào nấm", [["caiThia", 0.2], ["nam", 30]], 10000],
    ["bông cải luộc", [["bongCai", 0.2]], 0], ["củ xào thập cẩm", [["caRot", 0.1], ["dauHaLan", 40]], 5000],
    ["giá xào", [["gia", 0.2]], -10000],
  ]),
  T("Khoai tây", "Món phụ", "huy", 49000, [["khoaiTay", 0.2]], [
    ["chiên giòn", [["dauAn", 50]], 0], ["nghiền bơ tỏi", [["bo", 20], ["toi", 5]], 5000],
    ["nướng phô mai", [["cheddar", 40]], 15000], ["bỏ lò kem", [["kemTuoi", 50]], 15000], ["chiên lắc phô mai", [["parmesan", 15], ["dauAn", 50]], 10000],
  ]),
  T("Bánh mì nướng", "Món phụ", "nam", 39000, [["banhMi", 0.5], ["bo", 10]], [
    ["bơ tỏi", [["toi", 10]], 0], ["phô mai", [["mozzarella", 40]], 15000], ["muối ớt", [["ot", 5]], 0],
    ["trứng ốp", [["trung", 1]], 5000], ["cà chua", [["caChua", 0.05]], 0],
  ]),
  T("Bắp", "Món phụ", "nam", 35000, [["bap", 1]], [
    ["xào bơ", [["bo", 15]], 5000], ["luộc", [], -5000], ["nướng phô mai", [["cheddar", 30]], 15000],
  ]),
  T("Khoai lang", "Món phụ", "nam", 39000, [["khoaiLang", 0.2]], [
    ["chiên", [["dauAn", 40]], 0], ["nướng mật ong", [["matOng", 20]], 5000], ["kén", [["botMi", 30], ["dauAn", 30]], 5000],
  ]),
  T("Cơm chiên", "Món phụ", "minh", 49000, [["gao", 0.15], ["dauAn", 15]], [
    ["tỏi", [["toi", 15]], 0], ["trứng hành", [["trung", 1], ["hanhLa", 0.05]], 0], ["cá mặn", [["caThu", 0.05]], 10000],
  ]),

  // --- Tráng miệng ---
  T("Chè", "Tráng miệng", "minh", 39000, [["duong", 30], ["dua", 50]], [
    ["đậu xanh", [["dauXanh", 60]], 0], ["đậu đỏ", [["dauDo", 60]], 0], ["khoai môn", [["khoaiMon", 0.1]], 5000],
    ["thạch dừa", [["thachDua", 60]], 0], ["chuối", [["chuoi", 0.15], ["botNang", 10]], 0], ["bắp", [["bap", 1]], 0],
    ["thập cẩm", [["dauXanh", 30], ["dauDo", 30], ["thachDua", 30]], 10000],
  ]),
  T("Bánh flan", "Tráng miệng", "lucas", 39000, [["trung", 2], ["sua", 120], ["duong", 25]], [
    ["cà phê", [["caPhe", 10]], 5000], ["trà xanh", [["tra", 5]], 5000], ["dừa", [["dua", 40]], 5000], ["sô-cô-la", [["socola", 20]], 10000],
  ]),
  T("Kem", "Tráng miệng", "lucas", 49000, [["sua", 100], ["kemTuoi", 50], ["duong", 20]], [
    ["vani", [["vani", 2]], 0], ["dâu tây", [["dauTay", 0.05]], 10000], ["xoài", [["xoai", 0.05]], 5000],
    ["trà xanh", [["tra", 5]], 5000], ["dừa", [["dua", 50]], 5000], ["cà phê", [["caPhe", 10]], 5000],
  ]),
  T("Bánh", "Tráng miệng", "lucas", 65000, [["botMi", 60], ["trung", 1], ["bo", 20], ["duong", 30]], [
    ["chuối nướng", [["chuoi", 0.15]], -10000], ["bông lan sữa", [["sua", 50]], 0], ["tart trứng", [["sua", 50]], 0],
    ["su kem", [["kemTuoi", 50]], 0], ["brownie", [["socola", 40], ["cacao", 10]], 15000], ["mousse chanh dây", [["chanhDay", 2], ["kemTuoi", 50]], 20000],
  ]),
  T("Panna cotta", "Tráng miệng", "lucas", 75000, [["kemTuoi", 100], ["sua", 50], ["duong", 15]], [
    ["xoài", [["xoai", 0.05]], 0], ["chanh dây", [["chanhDay", 1]], 0], ["cà phê", [["caPhe", 10]], 0], ["sô-cô-la", [["socola", 20]], 5000],
  ]),
  T("Sữa chua", "Tráng miệng", "lucas", 35000, [["suaChua", 1]], [
    ["trái cây", [["xoai", 0.05], ["dauTay", 0.03]], 10000], ["dâu", [["dauTay", 0.05]], 5000], ["xoài", [["xoai", 0.05]], 5000],
    ["chanh dây", [["chanhDay", 1]], 5000], ["trân châu", [["tranChau", 30]], 5000],
  ]),

  // --- Đồ uống ---
  T("Trà", "Đồ uống", "nam", 39000, [["duong", 15]], [
    ["đào cam sả", [["traDen", 5], ["dao", 0.3], ["sa", 0.02]], 10000], ["sữa trân châu", [["traDen", 5], ["sua", 100], ["tranChau", 40]], 10000],
    ["chanh", [["traDen", 5], ["chanh", 1]], -10000], ["xanh mật ong", [["tra", 5], ["matOng", 15]], 0],
    ["dâu tây", [["traDen", 5], ["dauTay", 0.05]], 5000], ["gừng mật ong", [["gung", 10], ["matOng", 15]], 0],
    ["ổi hồng", [["traDen", 5], ["oi", 0.1]], 5000],
  ]),
  T("Sinh tố", "Đồ uống", "nam", 49000, [["sua", 50], ["duong", 15]], [
    ["bơ", [["traiBo", 0.15]], 5000], ["dâu", [["dauTay", 0.1]], 10000], ["chuối", [["chuoi", 0.15]], -5000],
    ["thơm", [["thom", 0.3]], 0], ["dưa hấu", [["duaHau", 0.2]], -5000],
  ]),
  T("Nước ép", "Đồ uống", "nam", 45000, [], [
    ["cam cà rốt", [["cam", 0.3], ["caRot", 0.1]], 5000], ["thơm", [["thom", 0.5]], 0], ["ổi", [["oi", 0.3]], 0],
    ["dưa leo", [["duaLeo", 0.3]], -5000], ["cà rốt", [["caRot", 0.3]], -5000],
  ]),
  T("Cà phê", "Đồ uống", "minh", 35000, [["caPhe", 25]], [
    ["đen đá", [], -5000], ["sữa nóng", [["suaDac", 30]], 0], ["cốt dừa", [["dua", 50], ["suaDac", 20]], 15000],
    ["trứng", [["trung", 1], ["suaDac", 20]], 15000], ["bạc xỉu", [["sua", 80], ["suaDac", 20]], 5000],
    ["latte", [["sua", 150]], 20000], ["cappuccino", [["sua", 120]], 20000],
  ]),
  T("Soda", "Đồ uống", "nam", 39000, [["duong", 15], ["chanh", 1]], [
    ["chanh dây", [["chanhDay", 1]], 0], ["dâu", [["dauTay", 0.05]], 5000], ["xoài", [["xoai", 0.1]], 0], ["thơm", [["thom", 0.2]], 0],
  ]),
  T("Cacao", "Đồ uống", "lucas", 45000, [["cacao", 20], ["sua", 150]], [
    ["nóng", [], 0], ["đá", [], 0], ["sữa dừa", [["dua", 50]], 10000],
  ]),
];

// Phong cách và khẩu phần nhân thêm số biến thể; đồ uống dùng khẩu phần riêng
const STYLES = [["", 1], ["đặc biệt", 1.25], ["kiểu nhà làm", 1.1]];
const FOOD_SIZES = [["", 1], ["phần nhỏ", 0.75], ["phần lớn", 1.4], ["phần gia đình", 2.6], ["suất trưa", 0.85]];
const DRINK_SIZES = [["", 1], ["ly nhỏ", 0.8], ["ly lớn", 1.3], ["bình 1 lít", 2.8], ["ít đường", 1]];

const TAGLINES = {
  "Khai vị": ["Món mở đầu nhẹ nhàng", "Khai vị giòn ngon", "Món nhỏ để chia sẻ cùng bạn bè"],
  "Món chính": ["Món chính đậm đà, nấu theo công thức của bếp", "Phần ăn no bụng cho bữa trưa hoặc tối", "Món ruột của nhà hàng"],
  "Món phụ": ["Món ăn kèm cho các món chính", "Món phụ đơn giản mà đưa cơm"],
  "Tráng miệng": ["Món ngọt kết thúc bữa ăn", "Tráng miệng mát lạnh, ngọt dịu"],
  "Đồ uống": ["Thức uống pha tại quầy", "Đồ uống giải khát mát lạnh"],
};

// Món có ký tự % và _ trong tên để kiểm tra tìm kiếm escape đúng (deck Block 7, slide 25)
const specialDishes = [
  { name: "Combo 100% bò Úc", category: "Món chính", chef: "huy", price: 459000, recipe: [["thitBo", 0.35], ["khoaiTay", 0.15], ["tieu", 5]],
    description: "Combo bò Úc nguyên chất 100%: thăn bò nướng, khoai tây chiên và sốt tiêu đen." },
  { name: "Bánh 50% đường", category: "Tráng miệng", chef: "lucas", price: 59000, recipe: [["botMi", 60], ["trung", 1], ["duong", 15]],
    description: "Bánh bông lan giảm một nửa lượng đường (50%) cho khách ăn kiêng." },
  { name: "Trà_sữa_nhà_làm", category: "Đồ uống", chef: "nam", price: 45000, recipe: [["traDen", 5], ["sua", 120], ["tranChau", 40]],
    description: "Trà sữa nhà làm với trà đen ủ lạnh, sữa tươi và trân châu đường đen." },
];

// PRNG cố định (mulberry32) để mỗi lần seed ra cùng một thực đơn
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roundPrice = (n) => Math.max(1000, Math.round(n / 1000) * 1000);
const roundQty = (n) => Math.round(n * 1000) / 1000;

// Gộp nguyên liệu trùng (cộng định lượng), nhân theo khẩu phần, tối đa 6 dòng
function mergeRecipe(lines, factor) {
  const byKey = new Map();
  for (const [key, qty] of lines) byKey.set(key, (byKey.get(key) || 0) + qty);
  return [...byKey].slice(0, 6).map(([key, qty]) => [key, roundQty(qty * factor)]);
}

function buildCatalog() {
  const random = mulberry32(20261030);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const allIngredients = { ...ingredients, ...extraIngredients };

  // Ảnh dùng lại theo danh mục từ các món viết tay
  const imagesByCategory = {};
  for (const d of baseDishes) (imagesByCategory[d.category] ||= []).push(d.imageUrl);

  const used = new Set(baseDishes.map((d) => d.name));
  const generated = specialDishes.map((d) => {
    used.add(d.name);
    return { ...d, imageUrl: imagesByCategory[d.category][0], available: true };
  });

  // Mọi tổ hợp mẫu × biến thể × phong cách × khẩu phần, xáo trộn cố định rồi lấy đủ số món
  const combos = [];
  for (const t of templates) {
    const sizes = t.category === "Đồ uống" ? DRINK_SIZES : FOOD_SIZES;
    for (const v of t.variants) for (const s of STYLES) for (const z of sizes) combos.push([t, v, s, z]);
  }
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }

  const need = TOTAL_DISHES - baseDishes.length - generated.length;
  for (const [t, [suffix, extra, delta], [style, styleFactor], [size, sizeFactor]] of combos) {
    if (generated.length - specialDishes.length >= need) break;
    const name = [t.base, suffix, style].filter(Boolean).join(" ") + (size ? ` (${size})` : "");
    if (used.has(name)) continue;
    used.add(name);

    const recipe = mergeRecipe([...t.core, ...extra], sizeFactor);
    // Mô tả nêu nguyên liệu riêng của biến thể trước (để tìm toàn văn theo nguyên liệu)
    const main = [...new Set([...extra, ...t.core].map(([key]) => key))]
      .slice(0, 3)
      .map((key) => allIngredients[key].name.toLocaleLowerCase("vi"));
    generated.push({
      name,
      description: `${pick(TAGLINES[t.category])}: ${t.base.toLocaleLowerCase("vi")} ${suffix}${style ? " " + style : ""}, làm từ ${main.join(", ")}.`,
      price: roundPrice((t.price + delta) * styleFactor * sizeFactor),
      category: t.category,
      imageUrl: pick(imagesByCategory[t.category]),
      available: random() >= 0.15,
      chef: t.chef,
      recipe,
    });
  }

  return {
    chefs,
    ingredients: allIngredients,
    dishes: [...baseDishes, ...generated].map((d) => ({ available: true, ...d })),
  };
}

module.exports = { TOTAL_DISHES, buildCatalog };
