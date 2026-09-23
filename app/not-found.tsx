import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 grid place-items-center px-4">
      <div className="text-center">
        <div className="tag mb-4">HTTP 404</div>
        <h1 className="font-sans font-bold text-4xl mb-6">Nothing here.</h1>
        <Link href="/" className="btn-ghost inline-block">BACK_</Link>
      </div>
    </main>
  );
}
