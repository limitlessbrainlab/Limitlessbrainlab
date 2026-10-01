import { useEffect, useState } from 'react';

const TextType = ({ text, typingSpeed = 75, pauseDuration = 1500, showCursor = false, cursorCharacter = '|', loop = true }) => {
  const messages = Array.isArray(text) ? text : [text];
  const [messageIndex, setMessageIndex] = useState(0);
  const [characterIndex, setCharacterIndex] = useState(0);
  const message = messages[messageIndex] || '';

  useEffect(() => {
    if (characterIndex === message.length && !loop) return undefined;

    const timer = setTimeout(() => {
      if (characterIndex < message.length) {
        setCharacterIndex((index) => index + 1);
      } else {
        setCharacterIndex(0);
        setMessageIndex((index) => (index + 1) % messages.length);
      }
    }, characterIndex < message.length ? typingSpeed : pauseDuration);

    return () => clearTimeout(timer);
  }, [characterIndex, loop, message, messages.length, pauseDuration, typingSpeed]);

  return (
    <span>
      {message.slice(0, characterIndex)}
      {showCursor && (loop || characterIndex < message.length) && <span aria-hidden="true" className="animate-pulse">{cursorCharacter}</span>}
    </span>
  );
};

export default TextType;
