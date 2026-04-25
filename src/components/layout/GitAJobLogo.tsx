import Link from "next/link";

type Props = {
  href?: string;
  className?: string;
  imageClassName?: string;
};

export default function GitAJobLogo({
  href = "/",
  className = "inline-flex items-center",
  imageClassName = "h-9 w-auto object-contain",
}: Props) {
  return (
    <Link href={href} className={className} aria-label="Git-a-Job home">
      <img src="/git-a-job-logo-transparent.png" alt="Git-a-Job" className={imageClassName} />
    </Link>
  );
}
