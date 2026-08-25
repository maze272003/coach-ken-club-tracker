import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/format";

export function StudentAvatar({
  name,
  image,
  className,
}: {
  name: string | null;
  image?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}
