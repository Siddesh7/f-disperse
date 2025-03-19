import { Heart } from "lucide-react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full border-t bg-background py-4 mt-auto">
      <div className="container mx-auto flex items-center justify-center px-4 text-sm text-muted-foreground">
        <p className="flex items-center gap-1">
          vibe coded with{" "}
          <Heart className="h-4 w-4 text-red-500 fill-red-500" /> by{" "}
          <Link
            href="https://twitter.com/0xSiddesh"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            @0xSiddesh
          </Link>{" "}
          at{" "}
          <Link
            href="https://x.com/BasedIndia"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            BasedIndia
          </Link>
        </p>
      </div>
    </footer>
  );
}
