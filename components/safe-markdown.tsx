"use client"

import type { ReactNode } from "react"

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={`${match.index}-strong`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={`${match.index}-code`}>{token.slice(1, -1)}</code>)
    } else {
      nodes.push(token)
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

function renderParagraph(text: string, key: string) {
  return <p key={key}>{renderInline(text)}</p>
}

export function SafeMarkdown({
  content,
  className,
}: {
  content: string
  className: string
}) {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i++
      continue
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      blocks.push(
        <pre key={`pre-${blocks.length}`}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      )
      continue
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const text = heading[2]
      if (level === 1) blocks.push(<h1 key={`h1-${blocks.length}`}>{renderInline(text)}</h1>)
      if (level === 2) blocks.push(<h2 key={`h2-${blocks.length}`}>{renderInline(text)}</h2>)
      if (level === 3) blocks.push(<h3 key={`h3-${blocks.length}`}>{renderInline(text)}</h3>)
      i++
      continue
    }

    if (trimmed === "---") {
      blocks.push(<hr key={`hr-${blocks.length}`} />)
      i++
      continue
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2))
        i++
      }
      blocks.push(
        <blockquote key={`blockquote-${blocks.length}`}>
          {quoteLines.map((quoteLine, index) =>
            renderParagraph(quoteLine, `quote-${blocks.length}-${index}`)
          )}
        </blockquote>
      )
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""))
        i++
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {items.map((item, index) => (
            <li key={`ul-item-${index}`}>{renderInline(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""))
        i++
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`}>
          {items.map((item, index) => (
            <li key={`ol-item-${index}`}>{renderInline(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    const paragraphLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("> ") &&
      !/^#{1,3}\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      lines[i].trim() !== "---"
    ) {
      paragraphLines.push(lines[i].trim())
      i++
    }
    blocks.push(renderParagraph(paragraphLines.join(" "), `p-${blocks.length}`))
  }

  return <div className={className}>{blocks}</div>
}
