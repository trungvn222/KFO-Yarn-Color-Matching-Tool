import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const result = await login(request);
  // result is null on success (redirect thrown), or { shop: LoginErrorType } on failure
  console.log("[auth/login] loader result:", result);
  return result;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return login(request);
};

export default function AuthLogin() {
  return null;
}
