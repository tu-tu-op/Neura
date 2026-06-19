interface SplitTextProps {
  text: string;
  className?: string;
}

export function SplitText({ text, className = "" }: SplitTextProps) {
  const words = text.split(" ");
  let characterIndex = 0;

  return (
    <h1 className={`split-text ${className}`} aria-label={text}>
      {words.map((word, wordIndex) => (
        <span className="split-text-word" aria-hidden="true" key={`${word}-${wordIndex}`}>
          {word.split("").map((character) => {
            const delay = characterIndex * 28;
            characterIndex += 1;

            return (
              <span className="split-text-char" style={{ animationDelay: `${delay}ms` }} key={`${wordIndex}-${characterIndex}`}>
                {character}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
