import { Home } from "../components/home";
import { listCmsNews } from "../lib/cms-runtime";

export default async function Page() {
  const latestNews = (await listCmsNews()).slice(0,3);
  return <Home latestNews={latestNews} />;
}
