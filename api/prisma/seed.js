require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { buildCatalog } = require("./catalog");

const prisma = new PrismaClient();

// Ghi thực đơn mẫu (prisma/catalog.js) vào database. Xóa sạch dữ liệu cũ trước, kể cả đặt bàn.
// Dùng createMany (mỗi bảng vài câu INSERT) để seed 1.500 món lên Supabase trong vài giây.
async function main() {
  const { chefs, ingredients, dishes } = buildCatalog();

  // Xóa theo thứ tự: bảng nối trước, rồi tới các bảng chính
  await prisma.booking.deleteMany();
  await prisma.dishIngredient.deleteMany();
  await prisma.dish.deleteMany();
  await prisma.chef.deleteMany();
  await prisma.ingredient.deleteMany();

  // Tên đầu bếp / nguyên liệu / món đều không trùng nên dùng tên để lấy lại id sau createMany
  const idsByName = async (model) => new Map((await model.findMany({ select: { id: true, name: true } })).map((r) => [r.name, r.id]));

  await prisma.chef.createMany({ data: Object.values(chefs) });
  const chefIdByName = await idsByName(prisma.chef);
  const chefIds = Object.fromEntries(Object.entries(chefs).map(([key, c]) => [key, chefIdByName.get(c.name)]));

  await prisma.ingredient.createMany({ data: Object.values(ingredients) });
  const ingredientIdByName = await idsByName(prisma.ingredient);
  const ingredientIds = Object.fromEntries(Object.entries(ingredients).map(([key, i]) => [key, ingredientIdByName.get(i.name)]));

  await prisma.dish.createMany({
    data: dishes.map(({ chef, recipe, ...dish }) => ({ ...dish, chefId: chefIds[chef] })),
  });
  const dishIds = await idsByName(prisma.dish);

  const recipeRows = dishes.flatMap((d) =>
    d.recipe.map(([key, quantity]) => ({ dishId: dishIds.get(d.name), ingredientId: ingredientIds[key], quantity }))
  );
  await prisma.dishIngredient.createMany({ data: recipeRows });

  console.log(
    `Seed xong: ${dishes.length} món ăn, ${Object.keys(chefs).length} đầu bếp, ` +
      `${Object.keys(ingredients).length} nguyên liệu, ${recipeRows.length} dòng công thức.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
