import { memo, useCallback, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow'
import 'reactflow/dist/style.css'
import './App.css'

const NODE_WIDTH = 170
const NODE_HEIGHT = 54
const HORIZONTAL_GAP = 34
const VERTICAL_GAP = 92

const treeData = {
  id: 'root',
  label: 'Root',
  meta: 'Level 0',
  children: [
    {
      id: 'a',
      label: 'A',
      meta: 'Team A',
      children: [
        { id: 'a1', label: 'A1', meta: 'Leaf' },
        { id: 'a2', label: 'A2', meta: 'Leaf' },
      ],
    },
    {
      id: 'b',
      label: 'B',
      meta: 'Team B',
      children: [
        { id: 'b1', label: 'B1', meta: 'Leaf' },
        { id: 'b2', label: 'B2', meta: 'Leaf' },
      ],
    },
    {
      id: 'c',
      label: 'C',
      meta: 'Extra branch',
      children: [
        {
          id: 'c1',
          label: 'C1',
          meta: 'Sub group',
          children: [
            { id: 'c1a', label: 'C1a', meta: 'Leaf' },
            { id: 'c1b', label: 'C1b', meta: 'Leaf' },
          ],
        },
      ],
    },
  ],
}

const TreeNode = memo(({ data }) => {
  return (
    <div className={`tree-node ${data.isCollapsed ? 'is-collapsed' : ''}`}>
      <div className="node-header">
        <span>{data.label}</span>
        {data.hasChildren && (
          <button
            type="button"
            className="collapse-btn"
            onClick={() => data.onToggle(data.id)}
          >
            {data.isCollapsed ? '+' : '-'}
          </button>
        )}
      </div>
      <div className="node-meta">{data.meta}</div>
    </div>
  )
})

TreeNode.displayName = 'TreeNode'

const nodeTypes = { treeNode: TreeNode }

function getVisibleChildren(node, collapsed) {
  if (collapsed.has(node.id)) {
    return []
  }
  return node.children ?? []
}

function getSubtreeWidth(node, collapsed) {
  const children = getVisibleChildren(node, collapsed)
  if (children.length === 0) {
    return NODE_WIDTH
  }

  const childrenWidth =
    children.reduce((sum, child) => sum + getSubtreeWidth(child, collapsed), 0) +
    (children.length - 1) * HORIZONTAL_GAP

  return Math.max(NODE_WIDTH, childrenWidth)
}

function buildLayout(root, collapsed, onToggle) {
  const nodes = []
  const edges = []

  const walk = (node, depth, left) => {
    const subtreeWidth = getSubtreeWidth(node, collapsed)
    const children = getVisibleChildren(node, collapsed)
    const nodeX = left + (subtreeWidth - NODE_WIDTH) / 2
    const nodeY = depth * (NODE_HEIGHT + VERTICAL_GAP)

    nodes.push({
      id: node.id,
      type: 'treeNode',
      position: { x: nodeX, y: nodeY },
      data: {
        id: node.id,
        label: node.label,
        meta: node.meta ?? '',
        hasChildren: (node.children?.length ?? 0) > 0,
        isCollapsed: collapsed.has(node.id),
        onToggle,
      },
      draggable: false,
      selectable: true,
    })

    let childLeft = left
    children.forEach((child) => {
      edges.push({
        id: `${node.id}-${child.id}`,
        source: node.id,
        target: child.id,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      })

      const childWidth = getSubtreeWidth(child, collapsed)
      walk(child, depth + 1, childLeft)
      childLeft += childWidth + HORIZONTAL_GAP
    })
  }

  walk(root, 0, 0)
  return { nodes, edges }
}

function App() {
  const [collapsed, setCollapsed] = useState(new Set())

  const onToggle = useCallback((nodeId) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const { nodes, edges } = useMemo(
    () => buildLayout(treeData, collapsed, onToggle),
    [collapsed, onToggle],
  )

  return (
    <div className="tree-wrapper">
      <header className="page-header">
        <h1>Tree View Visualizer</h1>
        <p>Click the +/- icon on any parent node to collapse or expand its subtree.</p>
      </header>
      <div className="flow-shell">
        <ReactFlow
          fitView
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          minZoom={0.3}
          maxZoom={1.6}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}

export default App
