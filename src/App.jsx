import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow'
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

function buildTreeIndex(root) {
  const parentById = new Map()
  const depthById = new Map()
  const nodeById = new Map()

  const walk = (node, parentId, depth) => {
    parentById.set(node.id, parentId)
    depthById.set(node.id, depth)
    nodeById.set(node.id, node)
    ;(node.children ?? []).forEach((child) => walk(child, node.id, depth + 1))
  }

  walk(root, null, 0)
  return { parentById, depthById, nodeById }
}

function getVisibleChildren(node, collapsed, forcedExpanded) {
  if (collapsed.has(node.id) && !forcedExpanded.has(node.id)) {
    return []
  }
  return node.children ?? []
}

function getSubtreeWidth(node, collapsed, forcedExpanded) {
  const children = getVisibleChildren(node, collapsed, forcedExpanded)
  if (children.length === 0) {
    return NODE_WIDTH
  }

  const childrenWidth =
    children.reduce(
      (sum, child) => sum + getSubtreeWidth(child, collapsed, forcedExpanded),
      0,
    ) +
    (children.length - 1) * HORIZONTAL_GAP

  return Math.max(NODE_WIDTH, childrenWidth)
}

const TreeNode = memo(({ data }) => {
  return (
    <div
      className={[
        'tree-node',
        data.isCollapsed ? 'is-collapsed' : '',
        data.isActive ? 'is-active' : '',
        data.isMatched ? 'is-matched' : '',
      ]
        .join(' ')
        .trim()}
    >
      <Handle type="target" position={Position.Top} className="node-handle" />
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
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  )
})

TreeNode.displayName = 'TreeNode'
const nodeTypes = { treeNode: TreeNode }

function buildLayout(
  root,
  collapsed,
  forcedExpanded,
  onToggle,
  hoveredId,
  selectedId,
  matchedNodeIds,
) {
  const nodes = []
  const edges = []

  const walk = (node, depth, left) => {
    const subtreeWidth = getSubtreeWidth(node, collapsed, forcedExpanded)
    const children = getVisibleChildren(node, collapsed, forcedExpanded)
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
        isCollapsed: collapsed.has(node.id) && !forcedExpanded.has(node.id),
        isActive: hoveredId === node.id || selectedId === node.id,
        isMatched: matchedNodeIds.has(node.id),
        onToggle,
      },
      draggable: false,
      selectable: true,
    })

    let childLeft = left
    children.forEach((child) => {
      const isRelatedToFocus =
        hoveredId === node.id ||
        hoveredId === child.id ||
        selectedId === node.id ||
        selectedId === child.id

      edges.push({
        id: `${node.id}-${child.id}`,
        source: node.id,
        target: child.id,
        type: 'step',
        animated: isRelatedToFocus,
        style: {
          stroke: isRelatedToFocus ? '#38bdf8' : '#9aa8bc',
          strokeWidth: isRelatedToFocus ? 2.2 : 1.45,
          transition: 'stroke 180ms ease, stroke-width 180ms ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isRelatedToFocus ? '#38bdf8' : '#9aa8bc',
        },
      })

      const childWidth = getSubtreeWidth(child, collapsed, forcedExpanded)
      walk(child, depth + 1, childLeft)
      childLeft += childWidth + HORIZONTAL_GAP
    })
  }

  walk(root, 0, 0)
  return { nodes, edges }
}

function TreeCanvas() {
  const { fitView, setCenter } = useReactFlow()
  const treeIndex = useMemo(() => buildTreeIndex(treeData), [])
  const [collapsed, setCollapsed] = useState(new Set())
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState('root')
  const [search, setSearch] = useState('')
  const [isDark, setIsDark] = useState(true)

  const matchedNodeIds = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return new Set()
    }

    const matches = new Set()
    treeIndex.nodeById.forEach((node, id) => {
      const text = `${node.label} ${node.meta ?? ''}`.toLowerCase()
      if (text.includes(query)) {
        matches.add(id)
      }
    })
    return matches
  }, [search, treeIndex])

  const forcedExpanded = useMemo(() => {
    if (matchedNodeIds.size === 0) {
      return new Set()
    }
    const expanded = new Set()
    matchedNodeIds.forEach((id) => {
      let parent = treeIndex.parentById.get(id)
      while (parent) {
        expanded.add(parent)
        parent = treeIndex.parentById.get(parent)
      }
    })
    return expanded
  }, [matchedNodeIds, treeIndex])

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

  const collapseAll = useCallback(() => {
    const ids = []
    const collect = (node) => {
      if (node.children?.length) {
        ids.push(node.id)
        node.children.forEach(collect)
      }
    }
    collect(treeData)
    setCollapsed(new Set(ids))
    setSelectedNodeId('root')
  }, [])

  const expandAll = useCallback(() => {
    setCollapsed(new Set())
  }, [])

  const { nodes, edges } = useMemo(
    () =>
      buildLayout(
        treeData,
        collapsed,
        forcedExpanded,
        onToggle,
        hoveredNodeId,
        selectedNodeId,
        matchedNodeIds,
      ),
    [
      collapsed,
      forcedExpanded,
      hoveredNodeId,
      matchedNodeIds,
      onToggle,
      selectedNodeId,
    ],
  )

  const focusSelectedNode = useCallback(() => {
    if (!selectedNodeId) {
      fitView({ duration: 260, padding: 0.24, maxZoom: 1.15 })
      return
    }
    const selected = nodes.find((node) => node.id === selectedNodeId)
    if (!selected) {
      return
    }
    setCenter(
      selected.position.x + NODE_WIDTH / 2,
      selected.position.y + NODE_HEIGHT / 2,
      { zoom: 1.05, duration: 280 },
    )
  }, [fitView, nodes, selectedNodeId, setCenter])

  useEffect(() => {
    fitView({ duration: 360, padding: 0.24, maxZoom: 1.2 })
  }, [collapsed, fitView, forcedExpanded, matchedNodeIds.size])

  useEffect(() => {
    if (matchedNodeIds.size > 0) {
      setSelectedNodeId((prev) => {
        if (prev && matchedNodeIds.has(prev)) {
          return prev
        }
        return [...matchedNodeIds][0]
      })
    }
  }, [matchedNodeIds])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === '/') {
        event.preventDefault()
        const input = document.getElementById('tree-search-input')
        input?.focus()
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        fitView({ duration: 260, padding: 0.24, maxZoom: 1.15 })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fitView])

  const selectedNodeData = selectedNodeId ? treeIndex.nodeById.get(selectedNodeId) : null
  const selectedNodeDepth = selectedNodeId ? treeIndex.depthById.get(selectedNodeId) : null

  return (
    <div className={`tree-wrapper ${isDark ? 'dark' : 'light'}`}>
      <header className="page-header">
        <h1>Tree View Visualizer</h1>
        <p>
          Clean hierarchy layout with centered parent nodes, connected edges, and smooth
          expand/collapse.
        </p>
        <div className="toolbar">
          <input
            id="tree-search-input"
            type="text"
            value={search}
            placeholder="Search node label or metadata..."
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="button" onClick={() => setIsDark((prev) => !prev)}>
            {isDark ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" onClick={expandAll}>
            Expand all
          </button>
          <button type="button" onClick={collapseAll}>
            Collapse all
          </button>
          <button type="button" onClick={focusSelectedNode}>
            Focus selected
          </button>
        </div>
        <small className="kbd-hint">Shortcuts: `/` search, `F` fit view</small>
      </header>
      <div className="layout-shell">
        <div className="flow-shell">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.24, maxZoom: 1.2 }}
            onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
            onNodeMouseLeave={() => setHoveredNodeId(null)}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            minZoom={0.25}
            maxZoom={1.9}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color={isDark ? '#314056' : '#d4dce7'} />
            <MiniMap
              zoomable
              pannable
              nodeColor={(node) =>
                node.id === selectedNodeId ? '#38bdf8' : isDark ? '#243245' : '#7e91a9'
              }
              maskColor={isDark ? 'rgba(15,23,42,0.34)' : 'rgba(15,23,42,0.08)'}
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside className="meta-panel">
          <h3>Node details</h3>
          {selectedNodeData ? (
            <>
              <p>
                <strong>Label:</strong> {selectedNodeData.label}
              </p>
              <p>
                <strong>Id:</strong> {selectedNodeData.id}
              </p>
              <p>
                <strong>Depth:</strong> {selectedNodeDepth}
              </p>
              <p>
                <strong>Metadata:</strong> {selectedNodeData.meta ?? 'N/A'}
              </p>
              <p>
                <strong>Children:</strong> {selectedNodeData.children?.length ?? 0}
              </p>
            </>
          ) : (
            <p>Select a node to inspect its metadata.</p>
          )}
          <div className="panel-stat">
            <p>
              <strong>Total visible nodes:</strong> {nodes.length}
            </p>
            <p>
              <strong>Matched nodes:</strong> {matchedNodeIds.size}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function TreeFlowApp() {
  return (
    <ReactFlowProvider>
      <TreeCanvas />
    </ReactFlowProvider>
  )
}

export default TreeFlowApp
