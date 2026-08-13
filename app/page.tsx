import { redirect } from "next/navigation";

// O design da landing (feito no Claude Design) vive em public/index.html,
// intocado, e é servido estático pela Vercel. Esta rota só existe porque o
// App Router precisa de algo em "/" — ela devolve direto pro HTML real.
export default function Home() {
  redirect("/index.html");
}
