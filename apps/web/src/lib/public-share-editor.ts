import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { parseImageWidth } from "@edgeever/shared/image-display";

const SharedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attributes) => {
          const width = parseImageWidth(attributes.width);
          return width ? { style: `width:${width}%;max-width:100%;height:auto` } : {};
        },
      },
      loading: {
        default: "lazy",
        renderHTML: () => ({ loading: "lazy" }),
      },
      decoding: {
        default: "async",
        renderHTML: () => ({ decoding: "async" }),
      },
      referrerpolicy: {
        default: "no-referrer",
        renderHTML: () => ({ referrerpolicy: "no-referrer" }),
      },
    };
  },
});

export const createPublicShareExtensions = () => [
  StarterKit,
  SharedImage.configure({ allowBase64: false }),
  TableKit,
];
