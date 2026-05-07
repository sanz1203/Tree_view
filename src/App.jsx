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

const initialTreeData = {
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

function addChildToTree(node, parentId, childNode) {
  if (node.id === parentId) {
    return {
      ...node,
      children: [...(node.children ?? []), childNode],
    }
  }

  if (!node.children?.length) {
    return node
  }

  return {
    ...node,
    children: node.children.map((child) => addChildToTree(child, parentId, childNode)),
  }
}

function removeNodeAndCollect(node, targetId) {
  if (!node.children?.length) {
    return { node, removedIds: new Set(), removed: false }
  }

  const removedIds = new Set()
  let removed = false

  const collectIds = (branch) => {
    removedIds.add(branch.id)
    ;(branch.children ?? []).forEach(collectIds)
  }

  const nextChildren = []
  node.children.forEach((child) => {
    if (child.id === targetId) {
      removed = true
      collectIds(child)
      return
    }
    const result = removeNodeAndCollect(child, targetId)
    if (result.removed) {
      removed = true
      result.removedIds.forEach((id) => removedIds.add(id))
    }
    nextChildren.push(result.node)
  })

  return {
    node: removed ? { ...node, children: nextChildren } : node,
    removedIds,
    removed,
  }
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
        isMatched: matchedNodeIds.has(node.id),
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
        type: 'step',
        animated: false,
        style: {
          stroke: '#9aa8bc',
          strokeWidth: 1.45,
          transition: 'stroke 180ms ease, stroke-width 180ms ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#9aa8bc',
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
  const [treeData, setTreeData] = useState(initialTreeData)
  const [collapsed, setCollapsed] = useState(new Set())
  const [selectedNodeId, setSelectedNodeId] = useState('root')
  const [search, setSearch] = useState('')
  const [newNodeLabel, setNewNodeLabel] = useState('')
  const [newNodeMeta, setNewNodeMeta] = useState('')
  const [newNodeParentId, setNewNodeParentId] = useState('root')
  const treeIndex = useMemo(() => buildTreeIndex(treeData), [treeData])

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
  }, [treeData])

  const expandAll = useCallback(() => {
    setCollapsed(new Set())
  }, [])

  const addNodeFromForm = useCallback(() => {
    const label = newNodeLabel.trim()
    const parentId = newNodeParentId.trim()
    if (!label || !treeIndex.nodeById.has(parentId)) {
      return
    }

    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    const baseId = slug || 'node'
    const usedIds = new Set(treeIndex.nodeById.keys())
    let candidate = baseId
    let counter = 1
    while (usedIds.has(candidate)) {
      candidate = `${baseId}-${counter}`
      counter += 1
    }

    const childNode = {
      id: candidate,
      label,
      meta: newNodeMeta.trim() || 'New node',
    }

    setTreeData((prev) => addChildToTree(prev, parentId, childNode))
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.delete(parentId)
      return next
    })
    setSelectedNodeId(candidate)
    setNewNodeLabel('')
    setNewNodeMeta('')
  }, [newNodeLabel, newNodeMeta, newNodeParentId, treeIndex.nodeById])

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId || selectedNodeId === 'root') {
      return
    }

    const selected = treeIndex.nodeById.get(selectedNodeId)
    if (!selected) {
      return
    }

    const shouldDelete = window.confirm(
      `Delete "${selected.label}" and its sub-nodes? This cannot be undone.`,
    )
    if (!shouldDelete) {
      return
    }

    const result = removeNodeAndCollect(treeData, selectedNodeId)
    if (!result.removed) {
      return
    }

    setTreeData(result.node)
    setCollapsed((prev) => {
      const next = new Set(prev)
      result.removedIds.forEach((id) => next.delete(id))
      return next
    })
    setSelectedNodeId('root')
  }, [selectedNodeId, treeData, treeIndex.nodeById])

  const { nodes, edges } = useMemo(
    () =>
      buildLayout(
        treeData,
        collapsed,
        forcedExpanded,
        onToggle,
        matchedNodeIds,
      ),
    [collapsed, forcedExpanded, matchedNodeIds, onToggle],
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
  const parentOptions = [...treeIndex.nodeById.values()]

  return (
    <div className="tree-wrapper light">
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
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            minZoom={0.25}
            maxZoom={1.9}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color="#d4dce7" />
            <MiniMap
              position="top-right"
              zoomable
              pannable
              style={{ width: 150, height: 96 }}
              nodeColor={(node) => (node.id === selectedNodeId ? '#38bdf8' : '#7e91a9')}
              maskColor="rgba(15,23,42,0.08)"
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
          <div className="add-node-panel">
            <h4>Add node</h4>
            <label htmlFor="parent-id">Parent</label>
            <select
              id="parent-id"
              value={newNodeParentId}
              onChange={(event) => setNewNodeParentId(event.target.value)}
            >
              {parentOptions.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label} ({node.id})
                </option>
              ))}
            </select>
            <label htmlFor="new-node-label">Label</label>
            <input
              id="new-node-label"
              type="text"
              value={newNodeLabel}
              onChange={(event) => setNewNodeLabel(event.target.value)}
              placeholder="e.g. B3"
            />
            <label htmlFor="new-node-meta">Metadata</label>
            <input
              id="new-node-meta"
              type="text"
              value={newNodeMeta}
              onChange={(event) => setNewNodeMeta(event.target.value)}
              placeholder="optional"
            />
            <button type="button" onClick={addNodeFromForm}>
              Add child node
            </button>
            <button
              type="button"
              className="danger-btn"
              onClick={deleteSelectedNode}
              disabled={!selectedNodeId || selectedNodeId === 'root'}
            >
              Delete selected node
            </button>
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
