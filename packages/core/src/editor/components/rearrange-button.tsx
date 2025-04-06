import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tiptap/core';
import { createPortal } from 'react-dom';
import { MoveVertical, X } from 'lucide-react';
import { BaseButton } from './base-button';
import { cn } from '../utils/classname';
import { TextSelection } from '@tiptap/pm/state';

type RearrangeButtonProps = {
  editor: Editor;
};

type NodeItem = {
  id: string;
  node: any;
  pos: number;
  preview: string;
  nodeSize: number;
  type: string;
};

export function RearrangeButton({ editor }: RearrangeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDraggingTouch, setIsDraggingTouch] = useState(false);
  const [touchStartY, setTouchStartY] = useState(0);
  const [touchDraggedItem, setTouchDraggedItem] = useState<HTMLElement | null>(null);
  
  // Refs for touch events
  const listRef = useRef<HTMLUListElement>(null);
  const touchItemIndex = useRef<number | null>(null);
  const touchTargetIndex = useRef<number | null>(null);

  // Only show on smaller screens
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setShowButton(window.innerWidth < 1024);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const collectNodes = () => {
    const items: NodeItem[] = [];
    const { doc } = editor.state;
    
    // Get only top-level nodes (direct children of the document)
    doc.content.forEach((node, offset, index) => {
      // Calculate the position - for top-level nodes, it's index + 1
      const pos = offset + 1;
      
      // Generate a preview based on node type
      let preview = '';
      if (node.type.name === 'paragraph') {
        preview = node.textContent.slice(0, 40) || '(Empty paragraph)';
      } else if (node.type.name === 'heading') {
        preview = `Heading: ${node.textContent.slice(0, 40)}`;
      } else if (node.type.name === 'image') {
        preview = 'Image';
      } else if (node.type.name === 'horizontalRule') {
        preview = 'Divider';
      } else if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
        preview = 'List';
      } else if (node.type.name === 'spacer') {
        preview = 'Spacer';
      } else if (node.type.name === 'section') {
        preview = 'Section';
      } else if (node.type.name === 'columns') {
        preview = 'Columns';
      } else if (node.type.name === 'htmlCodeBlock') {
        preview = 'HTML Block';
      } else if (node.type.name === 'logo') {
        preview = 'Logo';
      } else {
        preview = node.type.name;
      }

      items.push({
        id: `${node.type.name}-${index}`,
        node,
        pos,
        preview: preview || node.type.name,
        nodeSize: node.nodeSize,
        type: node.type.name
      });
    });

    setNodes(items);
  };

  const handleOpen = () => {
    collectNodes();
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    // Add drag data for browsers that need it
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    setDraggingIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggingIndex === null) return;
    if (draggingIndex === index) return;
    
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggingIndex === null || dragOverIndex === null) return;
    if (draggingIndex === dragOverIndex) return;

    // Reorder in the internal state
    const updatedNodes = [...nodes];
    const [draggedNode] = updatedNodes.splice(draggingIndex, 1);
    updatedNodes.splice(dragOverIndex, 0, draggedNode);
    setNodes(updatedNodes);

    // Create a simpler version of the document structure
    const originalIndices = nodes.map((_, index) => index);
    const newOrder = updatedNodes.map(updatedNode => 
      nodes.findIndex(originalNode => originalNode.id === updatedNode.id)
    );

    // Use the simplest approach: create a new document
    const { schema } = editor.state;
    
    // Create a new doc with only the top-level children in the new order
    const newContent = [];
    
    for (const index of newOrder) {
      const originalNode = nodes[index];
      newContent.push(originalNode.node);
    }
    
    // Create the transaction with the new document
    const newDoc = schema.nodes.doc.createAndFill(null, newContent);
    if (!newDoc) {
      console.error("Failed to create new document");
      return;
    }
    
    // Use replaceWith to replace the entire document content
    const tr = editor.state.tr;
    tr.replaceWith(0, editor.state.doc.content.size, newDoc.content);
    
    // Apply the transaction
    editor.view.dispatch(tr);
    
    // Reset drag state
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    const touch = e.touches[0];
    setTouchStartY(touch.clientY);
    touchItemIndex.current = index;
    
    // Set a timeout to determine if this is a long press (for drag)
    const timer = setTimeout(() => {
      setIsDraggingTouch(true);
      setDraggingIndex(index);
    }, 150);

    // Clear the timer if touch ends quickly
    const clearTimer = () => clearTimeout(timer);
    document.addEventListener('touchend', clearTimer, { once: true });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingTouch || draggingIndex === null) return;
    
    e.preventDefault(); // Prevent scrolling while dragging
    const touch = e.touches[0];
    
    // Find the element under the touch point
    const touchElement = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!touchElement) return;
    
    // Find the closest list item
    const listItem = touchElement.closest('li');
    if (!listItem) return;
    
    // Get index from data attribute
    const targetIndex = listItem.getAttribute('data-index');
    if (targetIndex !== null) {
      const index = parseInt(targetIndex);
      setDragOverIndex(index);
      touchTargetIndex.current = index;
    }
  };

  const handleTouchEnd = () => {
    if (isDraggingTouch && draggingIndex !== null && touchTargetIndex.current !== null) {
      // Similar logic to handleDrop
      const sourceIndex = draggingIndex;
      const targetIndex = touchTargetIndex.current;
      
      if (sourceIndex !== targetIndex) {
        // Reorder in the internal state
        const updatedNodes = [...nodes];
        const [draggedNode] = updatedNodes.splice(sourceIndex, 1);
        updatedNodes.splice(targetIndex, 0, draggedNode);
        setNodes(updatedNodes);

        // Update the document
        const newContent = [];
        for (const node of updatedNodes) {
          newContent.push(node.node);
        }
        
        const { schema } = editor.state;
        const newDoc = schema.nodes.doc.createAndFill(null, newContent);
        if (newDoc) {
          const tr = editor.state.tr;
          tr.replaceWith(0, editor.state.doc.content.size, newDoc.content);
          editor.view.dispatch(tr);
        }
      }
    }
    
    // Reset touch state
    setIsDraggingTouch(false);
    setDraggingIndex(null);
    setDragOverIndex(null);
    touchItemIndex.current = null;
    touchTargetIndex.current = null;
  };

  const handleNodeClick = (pos: number, nodeSize: number) => {
    try {
      // Make sure the positions are valid
      if (pos < 0 || pos > editor.state.doc.content.size) {
        console.warn('Invalid position:', pos);
        return;
      }
      
      // Set selection to this node
      editor.commands.focus(pos);
      
      // Close the modal
      handleClose();
    } catch (error) {
      console.error('Error selecting node:', error);
    }
  };

  if (!showButton) return null;

  return (
    <>
      <button
        className="mly-fixed mly-bottom-4 mly-right-4 mly-z-50 mly-flex mly-h-14 mly-w-14 mly-items-center mly-justify-center mly-rounded-full mly-bg-gray-900 mly-text-white mly-shadow-lg hover:mly-bg-gray-800 focus:mly-outline-none focus:mly-ring-2 focus:mly-ring-blue-500 focus:mly-ring-offset-2"
        onClick={handleOpen}
        aria-label="Rearrange content"
      >
        <MoveVertical className="mly-h-6 mly-w-6" />
      </button>

      {isOpen && createPortal(
        <div className="mly-fixed mly-inset-0 mly-z-50 mly-flex mly-flex-col mly-bg-white">
          <div className="mly-flex mly-items-center mly-justify-between mly-border-b mly-border-gray-200 mly-px-4 mly-py-3">
            <h2 className="mly-text-lg mly-font-medium">Rearrange Content</h2>
            <BaseButton
              variant="ghost"
              onClick={handleClose}
              className="mly-p-1"
            >
              <X className="mly-h-6 mly-w-6" />
            </BaseButton>
          </div>
          
          <div className="mly-flex-1 mly-overflow-y-auto mly-p-4">
            <p className="mly-mb-4 mly-text-sm mly-text-gray-500">
              Drag and drop items to rearrange your content.
            </p>
            
            <ul className="mly-space-y-2" ref={listRef}>
              {nodes.map((item, index) => (
                <li
                  key={item.id}
                  data-index={index}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => handleTouchStart(e, index)}
                  onClick={() => handleNodeClick(item.pos, item.nodeSize)}
                  className={cn(
                    "mly-relative mly-flex mly-cursor-pointer mly-items-center mly-rounded-md mly-border mly-border-gray-200 mly-bg-white mly-p-3 mly-shadow-sm",
                    draggingIndex === index && "mly-opacity-50 mly-border-dashed",
                    dragOverIndex === index && "mly-border-blue-500 mly-border-2",
                    isDraggingTouch && draggingIndex === index && "mly-opacity-70",
                    // Add top insertion line
                    dragOverIndex === index && draggingIndex !== null && draggingIndex < index && 
                      "before:mly-absolute before:mly-top-0 before:mly-left-0 before:mly-right-0 before:mly-h-1 before:mly-bg-blue-500 before:mly-rounded-t-md",
                    // Add bottom insertion line
                    dragOverIndex === index && draggingIndex !== null && draggingIndex > index && 
                      "after:mly-absolute after:mly-bottom-0 after:mly-left-0 after:mly-right-0 after:mly-h-1 after:mly-bg-blue-500 after:mly-rounded-b-md"
                  )}
                >
                  <div className="mly-mr-3 mly-cursor-grab mly-text-gray-400">
                    <MoveVertical className="mly-h-5 mly-w-5" />
                  </div>
                  <div className="mly-flex-1">
                    <div className="mly-text-sm mly-font-medium">{item.preview}</div>
                    <div className="mly-text-xs mly-text-gray-500">{item.type}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}