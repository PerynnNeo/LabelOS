import { cn } from "@/lib/utils";

/**
 * Editorial card primitives. Compose them:
 *
 *   <Card>
 *     <CardHeader>
 *       <CardTitle>Trend report</CardTitle>
 *     </CardHeader>
 *     <CardContent>…</CardContent>
 *     <CardFooter>…</CardFooter>
 *   </Card>
 *
 * All are shared (Server- and Client-safe) and forward native div props.
 */

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-line px-6 py-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "font-display text-lg leading-tight tracking-tight text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-sm leading-relaxed text-muted", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-6 py-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-line px-6 py-4",
        className,
      )}
      {...props}
    />
  );
}
