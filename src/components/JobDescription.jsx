import { parseDescription } from "../lib/descriptionMarkdown";

// ===========================================================================
// Renderer 2 of 2 for a job description: REACT ELEMENTS, never an HTML string.
//
// Carried item 27. The parse is in src/lib/descriptionMarkdown.js and is
// shared with the JSON-LD's HTML renderer, so the markup cannot drift from
// what this shows.
//
// THIS IS WHY A HOSTILE DESCRIPTION CANNOT EXECUTE ANYTHING, and it is
// structural rather than a matter of care:
//
//   * There is no `dangerouslySetInnerHTML` here, and none anywhere in src/.
//     The suite asserts that, because it is the entire injection surface for
//     this page.
//   * Every leaf below is a JSX text child. React escapes text children by
//     construction, so a recruiter's "<script>" is a string in a text node
//     and never meets an HTML parser. It is not escaped HTML -- it was never
//     HTML.
//   * The element types this file can produce come from a closed list:
//     h3/h4/h5, p, strong, em, ul, ol, li, br. There is no branch that takes
//     a tag name from the data.
//
// The page kept the property it was built with: it still never parses HTML.
// The fix added a parser, not an HTML path.
// ===========================================================================

function Inline({ nodes }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === "text") {
          // A plain string child. React escapes it; nothing here can change
          // that, which is the point.
          return <span key={index}>{node.value}</span>;
        }

        if (node.type === "break") return <br key={index} />;

        if (node.type === "strong") {
          return (
            <strong key={index} className="font-semibold">
              <Inline nodes={node.children} />
            </strong>
          );
        }

        if (node.type === "em") {
          return (
            <em key={index}>
              <Inline nodes={node.children} />
            </em>
          );
        }

        // Unreachable for a tree the parser produced. Rendering nothing means
        // an unknown node can only ever make the output smaller.
        return null;
      })}
    </>
  );
}

// min-w-0 and break-words are BOTH load-bearing on every block, for the
// reason check-overflow.mjs exists: a flex item's min-width defaults to its
// min-content size, and overflow-wrap does not reduce min-content. A
// 180-character unbroken word inside an <h3> is a different measurement from
// one inside a <p>, which is why the overflow fixture covers both.
const BLOCK = "min-w-0 break-words";

// EVERY TAG IS WRITTEN OUT LITERALLY, never taken from the data. An earlier
// version did `const Tag = headingTag(level)` and rendered `<Tag>`, which
// eslint rejected as creating a component during render -- and which was the
// weaker form of this code for a second reason: a tag name held in a variable
// is one edit away from being a tag name that came from the description.
// Spelled out, the closed list is visible in the source and a reviewer can
// read it without following a function.
function Items({ items }) {
  return items.map((item, index) => (
    <li key={index} className="min-w-0 break-words">
      <Inline nodes={item} />
    </li>
  ));
}

const LIST = `${BLOCK} mt-2 space-y-1 pl-5 text-[15px] leading-relaxed text-slate-800`;

function Block({ block }) {
  if (block.type === "heading") {
    if (block.level === 1) {
      return (
        <h3 className={`${BLOCK} mt-4 text-base font-bold text-slate-900 first:mt-0`}>
          <Inline nodes={block.inline} />
        </h3>
      );
    }

    if (block.level === 2) {
      return (
        <h4 className={`${BLOCK} mt-4 text-[15px] font-bold text-slate-900 first:mt-0`}>
          <Inline nodes={block.inline} />
        </h4>
      );
    }

    return (
      <h5 className={`${BLOCK} mt-4 text-[15px] font-semibold text-slate-900 first:mt-0`}>
        <Inline nodes={block.inline} />
      </h5>
    );
  }

  if (block.type === "list") {
    if (block.ordered) {
      return (
        <ol className={`${LIST} list-decimal`}>
          <Items items={block.items} />
        </ol>
      );
    }

    return (
      <ul className={`${LIST} list-disc`}>
        <Items items={block.items} />
      </ul>
    );
  }

  return (
    <p className={`${BLOCK} mt-2 text-[15px] leading-relaxed text-slate-800`}>
      <Inline nodes={block.inline} />
    </p>
  );
}

function JobDescription({ text }) {
  const blocks = parseDescription(text);

  // A description that parses to nothing still has to render something, or
  // the section heading above it would sit over empty space. The validation
  // rules make this unreachable for a new posting -- 400 characters minimum
  // -- but 24 of the existing 25 rows predate that minimum.
  if (!blocks.length) {
    return (
      <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
        No description was given for this role.
      </p>
    );
  }

  return (
    <div className="min-w-0">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

export default JobDescription;
