"use client";
import { useCombobox } from "downshift";

export default function DownshiftTest() {
  const items = ["Apple", "Banana", "Orange"];
  const {
    isOpen,
    getMenuProps,
    getInputProps,
    getItemProps,
    highlightedIndex,
  } = useCombobox({ items });

  return (
    <div>
      <input {...getInputProps()} placeholder="Type a fruit" />
      <ul {...getMenuProps()} style={{ border: "1px solid #ccc" }}>
        {isOpen &&
          items.map((item, index) => (
            <li
              key={item}
              {...getItemProps({ item, index })}
              style={{
                background: highlightedIndex === index ? "#bde4ff" : undefined,
              }}
            >
              {item}
            </li>
          ))}
      </ul>
    </div>
  );
} 