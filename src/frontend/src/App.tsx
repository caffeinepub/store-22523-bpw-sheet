import { Toaster } from "@/components/ui/sonner";
import BPWSheet from "./components/BPWSheet";

export default function App() {
  return (
    <>
      <BPWSheet />
      <Toaster richColors position="top-right" />
    </>
  );
}
