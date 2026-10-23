export default function FieldError({ message }) {
  if (!message) return null;
  return <p className="text-sm text-brand-700">{message}</p>;
}
