import React, { useMemo, useRef, useState } from 'react'
import { VirtualList, motion, render } from '@gpuix/react'

const buttonStyle = {
  padding: 8,
  paddingLeft: 12,
  paddingRight: 12,
  backgroundColor: '#313244',
  borderRadius: 6,
  color: '#cdd6f4',
  cursor: 'pointer',
} as const

type QualificationAppProps = {
  generation: number
  onRemount: () => void
}

function WindowsQualificationApp({ generation, onRemount }: QualificationAppProps) {
  const [count, setCount] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [keyboardEvents, setKeyboardEvents] = useState(0)
  const [focusOwner, setFocusOwner] = useState('none')
  const [textValue, setTextValue] = useState('')
  const [scrollEvents, setScrollEvents] = useState(0)
  const [conditionalMounted, setConditionalMounted] = useState(true)
  const [motionOpen, setMotionOpen] = useState(false)
  const [reverseKeys, setReverseKeys] = useState(false)
  const [stressTick, setStressTick] = useState(0)
  const [stressRunning, setStressRunning] = useState(false)
  const [visibleRange, setVisibleRange] = useState('none')
  const stressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const keyedRows = useMemo(() => {
    const rows = Array.from({ length: 120 }, (_, index) => index)
    return reverseKeys ? rows.reverse() : rows
  }, [reverseKeys])

  const runCommitChurn = () => {
    if (stressRunning) return
    if (stressTimer.current) clearInterval(stressTimer.current)
    setStressRunning(true)
    let next = 0
    stressTimer.current = setInterval(() => {
      next += 1
      setStressTick(next)
      if (next >= 120) {
        if (stressTimer.current) clearInterval(stressTimer.current)
        stressTimer.current = null
        setStressRunning(false)
      }
    }, 4)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: '100%',
        height: '100%',
        padding: 20,
        backgroundColor: '#11111b',
        color: '#cdd6f4',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div testId="render-status" style={{ fontSize: 20, fontWeight: 'bold' }}>
          render:ready
        </div>
        <div testId="root-generation">root-generation:{generation}</div>
        <div testId="remount-root" style={buttonStyle} onClick={onRemount}>
          remount root
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div testId="count-value">count:{count}</div>
        <div testId="increment" style={buttonStyle} onClick={() => setCount(value => value + 1)}>
          increment
        </div>
        <div testId="reset-count" style={buttonStyle} onClick={() => setCount(0)}>
          reset
        </div>
        <div
          testId="hover-probe"
          style={{ ...buttonStyle, backgroundColor: hovered ? '#a6e3a1' : '#313244' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          hover:{hovered ? 'inside' : 'outside'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div
          testId="keyboard-a"
          tabIndex={0}
          style={buttonStyle}
          onFocus={() => setFocusOwner('a')}
          onBlur={() => setFocusOwner(current => (current === 'a' ? 'none' : current))}
          onKeyDown={() => setKeyboardEvents(value => value + 1)}
        >
          keyboard-a
        </div>
        <div
          testId="keyboard-b"
          tabIndex={0}
          style={buttonStyle}
          onFocus={() => setFocusOwner('b')}
          onBlur={() => setFocusOwner(current => (current === 'b' ? 'none' : current))}
          onKeyDown={() => setKeyboardEvents(value => value + 1)}
        >
          keyboard-b
        </div>
        <div testId="focus-owner">focus:{focusOwner}</div>
        <div testId="keyboard-events">keyboard-events:{keyboardEvents}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          testId="text-input"
          value={textValue}
          placeholder="type here"
          style={{ width: 300, padding: 8, backgroundColor: '#181825', color: '#cdd6f4', borderRadius: 6 }}
          onChange={event => setTextValue(event.value ?? '')}
        />
        <div testId="input-value">input:{textValue}</div>
      </div>

      <div style={{ display: 'flex', gap: 12, height: 170 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '48%' }}>
          <div testId="scroll-events">scroll-events:{scrollEvents}</div>
          <div
            testId="scroll-box"
            style={{ height: 140, overflowY: 'scroll', padding: 6, backgroundColor: '#181825' }}
            onScroll={() => setScrollEvents(value => value + 1)}
          >
            {Array.from({ length: 40 }, (_, index) => (
              <div key={index} style={{ height: 24 }}>
                scroll-row-{index}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '48%' }}>
          <div testId="visible-range">visible-range:{visibleRange}</div>
          <VirtualList
            itemCount={2000}
            estimatedItemHeight={24}
            overdraw={96}
            style={{ height: 140, backgroundColor: '#181825' }}
            onVisibleRange={event => setVisibleRange(`${event.startIndex ?? 0}-${event.endIndex ?? 0}`)}
            renderItem={index => (
              <div key={index} style={{ height: 24 }}>
                virtual-row-{index}
              </div>
            )}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div testId="toggle-conditional" style={buttonStyle} onClick={() => setConditionalMounted(value => !value)}>
          toggle conditional
        </div>
        {conditionalMounted ? (
          <div testId="conditional-child">conditional:mounted</div>
        ) : (
          <div testId="conditional-empty">conditional:unmounted</div>
        )}

        <div testId="toggle-motion" style={buttonStyle} onClick={() => setMotionOpen(value => !value)}>
          toggle motion
        </div>
        <div testId="motion-state">motion:{motionOpen ? 'open' : 'closed'}</div>
        <motion.div
          initial={false}
          animate={{ width: motionOpen ? 220 : 80, opacity: motionOpen ? 1 : 0.45 }}
          transition={{ duration: 0.25, ease: 'linear' }}
          style={{ height: 18, backgroundColor: '#89b4fa', borderRadius: 4 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div testId="keyed-reorder" style={buttonStyle} onClick={() => setReverseKeys(value => !value)}>
          reorder keyed tree
        </div>
        <div testId="keyed-state">keyed:{reverseKeys ? 'reverse' : 'forward'}:{keyedRows[0]}</div>
        <div testId="stress-start" style={buttonStyle} onClick={runCommitChurn}>
          start commit churn
        </div>
        <div testId="stress-state">stress:{stressRunning ? 'running' : 'idle'}:{stressTick}</div>
      </div>

      <div
        testId="keyed-tree"
        style={{ display: 'flex', gap: 2, height: 54, overflowY: 'scroll', backgroundColor: '#181825', padding: 4 }}
      >
        {keyedRows.map(value => (
          <div
            key={value}
            style={{
              width: 20,
              height: 20,
              backgroundColor: value % 2 === 0 ? '#45475a' : '#585b70',
            }}
          >
            {value}
          </div>
        ))}
      </div>
    </div>
  )
}

const windowOptions = {
  title: 'GPUIX Windows Runtime Qualification',
  width: 980,
  height: 760,
} as const

let rootGeneration = 0

function mountQualificationRoot() {
  render(
    <WindowsQualificationApp
      generation={rootGeneration}
      onRemount={() => {
        rootGeneration += 1
        queueMicrotask(mountQualificationRoot)
      }}
    />,
    windowOptions
  )
}

mountQualificationRoot()
