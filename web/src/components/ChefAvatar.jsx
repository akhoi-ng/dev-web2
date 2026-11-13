// size: class Tailwind cho kích thước (vd. "h-12 w-12"); textSize: class cỡ chữ của chữ cái đầu
export default function ChefAvatar({ chef, size, textSize = "text-base" }) {
  const initial = (chef.name || "?").trim().split(/\s+/).pop().charAt(0).toUpperCase();

  if (chef.imageUrl) {
    return (
      <img
        src={chef.imageUrl}
        alt={chef.name}
        className={`${size} flex-none rounded-full object-cover ring-2 ring-white`}
      />
    );
  }
  return (
    <span
      className={`${size} ${textSize} flex flex-none items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 ring-2 ring-white`}
    >
      {initial}
    </span>
  );
}
