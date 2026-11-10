/**
 * Ant Design 5 et React 19 (embarqué par l'App Router de Next.js 15).
 *
 * Les API statiques (message, notification, Modal.confirm) montent leur rendu avec l'ancien
 * `ReactDOM.render`, absent de React 19 : antd affiche alors un avertissement de compatibilité.
 * `unstableSetRender` leur fournit `createRoot` — l'équivalent de `@ant-design/v5-patch-for-react-19`.
 */
import { unstableSetRender } from "antd";
import { createRoot, type Root } from "react-dom/client";

type Container = (Element | DocumentFragment) & { _reactRoot?: Root };

if (typeof window !== "undefined") {
  unstableSetRender((node, container) => {
    const el = container as Container;
    el._reactRoot ||= createRoot(el);
    const root = el._reactRoot;
    root.render(node);
    return async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      root.unmount();
    };
  });
}
