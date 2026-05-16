import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(`/app?${url.searchParams.toString()}`);
};

export default function Index() {
  return null;
}
