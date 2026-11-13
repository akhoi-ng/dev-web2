import { Link } from "react-router-dom";

// back: { href, label } (tuỳ chọn); subheading: chuỗi (tuỳ chọn)
export default function PageHeading({ heading, subheading, back }) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-brand-700">
          ← {back.label}
        </Link>
      )}
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{heading}</h1>
      {subheading && <p className="mt-1 text-stone-500">{subheading}</p>}
    </div>
  );
}
