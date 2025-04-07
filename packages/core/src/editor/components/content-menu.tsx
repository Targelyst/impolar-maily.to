import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useState } from 'react';

import { NodeSelection, TextSelection } from '@tiptap/pm/state';

import type { Node } from '@tiptap/pm/model';
import { Copy, GripVertical, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { BaseButton } from './base-button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Divider } from './ui/divider';
import { DragHandle } from '../plugins/drag-handle/drag-handle';
import { cn } from '../utils/classname';

export type ContentMenuProps = {
  editor: Editor;
};

export function ContentMenu(props: ContentMenuProps) {
  const { editor } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const [currentNode, setCurrentNode] = useState<Node | null>(null);
  const [currentNodePos, setCurrentNodePos] = useState<number>(-1);
  const [canMoveUp, setCanMoveUp] = useState(false);
  const [canMoveDown, setCanMoveDown] = useState(false);

  const handleNodeChange = useCallback(
    (data: { node: Node | null; editor: Editor; pos: number }) => {
      if (data.node) {
        setCurrentNode(data.node);
      }

      setCurrentNodePos(data.pos);
      
      const { state } = editor;
      const { doc } = state;
      
      if (data.pos > 0) {
        // Get the depth of current node
        const $pos = doc.resolve(data.pos);
        const depth = $pos.depth;
        
        // Allow moving for nodes at any depth as long as they have a parent
        if (depth > 0) {
          // Get the index within the parent
          const parentDepth = depth - 1;
          const index = $pos.index(parentDepth);
          const parent = $pos.node(parentDepth);
          
          setCanMoveUp(index > 0);
          setCanMoveDown(index < parent.content.childCount - 1);
        } else {
          // Top-level nodes directly in the document (depth = 0)
          const index = $pos.index(0);
          setCanMoveUp(index > 0);
          setCanMoveDown(index < doc.content.childCount - 1);
        }
      }
    },
    [editor, setCurrentNodePos, setCurrentNode, setCanMoveUp, setCanMoveDown]
  );

  function duplicateNode() {
    editor.commands.setNodeSelection(currentNodePos);
    const { $anchor } = editor.state.selection;
    const selectedNode =
      $anchor.node(1) || (editor.state.selection as NodeSelection).node;
    editor
      .chain()
      .setMeta('hideDragHandle', true)
      .insertContentAt(
        currentNodePos + (currentNode?.nodeSize || 0),
        selectedNode.toJSON()
      )
      .run();

    setMenuOpen(false);
  }

  function deleteCurrentNode() {
    editor
      .chain()
      .setMeta('hideDragHandle', true)
      .setNodeSelection(currentNodePos)
      .deleteSelection()
      .run();

    setMenuOpen(false);
  }

  function handleAddNewNode() {
    if (currentNodePos !== -1) {
      const currentNodeSize = currentNode?.nodeSize || 0;
      const insertPos = currentNodePos + currentNodeSize;
      const currentNodeIsEmptyParagraph =
        currentNode?.type.name === 'paragraph' &&
        currentNode?.content?.size === 0;
      const focusPos = currentNodeIsEmptyParagraph
        ? currentNodePos + 2
        : insertPos + 2;
      editor
        .chain()
        .command(({ dispatch, tr, state }: any) => {
          if (dispatch) {
            if (currentNodeIsEmptyParagraph) {
              tr.insertText('/', currentNodePos, currentNodePos + 1);
            } else {
              tr.insert(
                insertPos,
                state.schema.nodes.paragraph.create(null, [
                  state.schema.text('/'),
                ])
              );
            }

            return dispatch(tr);
          }

          return true;
        })
        .focus(focusPos)
        .run();
    }
  }
  

  function moveNodeDown() {
    if (!canMoveDown || currentNodePos === -1) return;
    
    const { state, dispatch } = editor.view;
    const { tr, doc } = state;
    
    // Find the nodes we're working with
    const $pos = doc.resolve(currentNodePos);
    const index = $pos.index(0);
    const nextIndex = index + 1;
    
    // Instead of manipulating positions directly, let's rebuild the document
    // with our nodes in the correct order
    
    // Create a new array of all top-level nodes
    const nodesToKeep = [];
    for (let i = 0; i < doc.content.childCount; i++) {
      if (i !== index && i !== nextIndex) {
        nodesToKeep.push(doc.child(i));
      }
    }
    
    // Insert them in the correct order (swapped)
    const currentNodeCopy = doc.child(index);
    const nextNodeCopy = doc.child(nextIndex);
    
    // Build nodes in the new order
    const reorderedNodes = [];
    doc.content.forEach((node, _, i) => {
      if (i === index) {
        reorderedNodes.push(nextNodeCopy);
      } else if (i === nextIndex) {
        reorderedNodes.push(currentNodeCopy);
      } else {
        reorderedNodes.push(node);
      }
    });
    
    // Create a new document with the nodes in the correct order
    const { schema } = state;
    const newDoc = schema.nodes.doc.create(null, reorderedNodes);
    
    // Replace the entire document
    const transaction = tr.replaceWith(0, doc.content.size, newDoc.content);
    
    // Calculate the new position of our moved node (now at nextIndex position)
    let newPos = 0;
    for (let i = 0; i < nextIndex; i++) {
      newPos += reorderedNodes[i].nodeSize;
    }
    
    // Set the selection to the moved node
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(newPos)));
    
    // Dispatch the transaction
    dispatch(transaction);
    
    // Close the menu
    setMenuOpen(false);
    
    // Update tracking state
    setCurrentNodePos(newPos);
    setCurrentNode(reorderedNodes[nextIndex]);
    setCanMoveUp(true);
    setCanMoveDown(nextIndex < doc.content.childCount - 2);
  }
  function moveNodeUp() {
    if (!canMoveUp || currentNodePos === -1) return;
    
    const { state, dispatch } = editor.view;
    const { tr, doc } = state;
    
    // Get the current node position info
    const $pos = doc.resolve(currentNodePos);
    const index = $pos.index(0);
    
    // Get the node before the current node
    const prevIndex = index - 1;
    const prevNode = doc.child(prevIndex);
    
    // Store current node content and attributes
    const currentNodeContent = currentNode?.content;
    const currentNodeAttrs = currentNode?.attrs;
    const currentNodeType = currentNode?.type;
    
    // Store the sizes before modification
    const currentNodeSize = currentNode?.nodeSize || 0;
    const prevNodeSize = prevNode.nodeSize;
    
    // Calculate insertion position (where the previous node starts)
    let insertPos = currentNodePos - prevNodeSize;
    
    // Create a new transaction for the entire operation
    let transaction = tr;
    
    // Create a new node with the same content and attributes
    if (currentNodeType && currentNodeContent) {
      const newNode = currentNodeType.create(currentNodeAttrs, currentNodeContent);
      
      // Use a single transaction: delete original, then insert at new position
      transaction = transaction
        .delete(currentNodePos, currentNodePos + currentNodeSize)
        .insert(insertPos, newNode);
      
      // Set selection to the moved node using TextSelection
      transaction = transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(insertPos))
      );
    }
    
    dispatch(transaction);
    
    // Close the menu immediately
    setMenuOpen(false);
    
    // Wait for the document to update before changing state
    setTimeout(() => {
      // Update the current node position
      setCurrentNodePos(insertPos);
      
      // Recalculate canMove states
      const updatedDoc = editor.state.doc;
      const updated$pos = updatedDoc.resolve(insertPos);
      const updatedIndex = updated$pos.index(0);
      
      setCanMoveUp(updatedIndex > 0);
      setCanMoveDown(true); // We can always move down after moving up
    }, 0);
  }

  useEffect(() => {
    if (menuOpen) {
      editor.commands.setMeta('lockDragHandle', true);
    } else {
      editor.commands.setMeta('lockDragHandle', false);
    }

    return () => {
      editor.commands.setMeta('lockDragHandle', false);
    };
  }, [editor, menuOpen]);

  return (
    <DragHandle
      pluginKey="ContentMenu"
      editor={editor}
      tippyOptions={{
        offset: [2, 0],
        zIndex: 99,
        placement: 'right-start',
      }}
      onNodeChange={handleNodeChange}
      className={cn(
        'mly-fixed mly-right-2 mly-top-1/2 mly-transform -mly-translate-y-1/2',
        editor.isEditable ? 'mly-visible' : 'mly-hidden'
      )}
    >
      <TooltipProvider>
        <div className="mly-flex mly-flex-col mly-items-center mly-gap-1 mly-bg-white mly-rounded-lg mly-border mly-border-gray-200 mly-shadow-md mly-p-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <BaseButton
                variant="ghost"
                size="icon"
                className="!mly-size-7 mly-cursor-pointer mly-text-gray-500 hover:mly-text-black"
                onClick={handleAddNewNode}
                type="button"
              >
                <Plus className="mly-size-3.5 mly-shrink-0" />
              </BaseButton>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>Add new node</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <BaseButton
                variant="ghost"
                size="icon"
                className={cn(
                  "!mly-size-7 mly-text-gray-500",
                  canMoveUp 
                    ? "mly-cursor-pointer hover:mly-text-black" 
                    : "mly-cursor-not-allowed mly-opacity-50"
                )}
                onClick={moveNodeUp}
                disabled={!canMoveUp}
                type="button"
              >
                <ChevronUp className="mly-size-3.5 mly-shrink-0" />
              </BaseButton>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>Move up</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <BaseButton
                variant="ghost"
                size="icon"
                className={cn(
                  "!mly-size-7 mly-text-gray-500",
                  canMoveDown 
                    ? "mly-cursor-pointer hover:mly-text-black" 
                    : "mly-cursor-not-allowed mly-opacity-50"
                )}
                onClick={moveNodeDown}
                disabled={!canMoveDown}
                type="button"
              >
                <ChevronDown className="mly-size-3.5 mly-shrink-0" />
              </BaseButton>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>Move down</TooltipContent>
          </Tooltip>

          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <div className="mly-relative mly-flex mly-flex-col">
              <Tooltip>
                <TooltipTrigger asChild>
                  <BaseButton
                    variant="ghost"
                    size="icon"
                    className="mly-relative mly-z-[1] !mly-size-7 mly-cursor-grab mly-text-gray-500 hover:mly-text-black"
                    onClick={(e) => {
                      e.preventDefault();
                      setMenuOpen(true);
                      editor.commands.setNodeSelection(currentNodePos);
                    }}
                    type="button"
                  >
                    <GripVertical className="mly-size-3.5 mly-shrink-0" />
                  </BaseButton>
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>Node actions</TooltipContent>
              </Tooltip>
              <PopoverTrigger className="mly-absolute mly-left-0 mly-top-0 mly-z-0 mly-h-5 mly-w-5" />
            </div>

            <PopoverContent
              align="start"
              side="right"
              sideOffset={8}
              className="mly-flex mly-w-max mly-flex-col mly-rounded-md mly-p-1"
            >
              <BaseButton
                variant="ghost"
                onClick={duplicateNode}
                className="mly-h-auto mly-justify-start mly-gap-2 !mly-rounded mly-px-2 mly-py-1 mly-text-sm mly-font-normal"
              >
                <Copy className="mly-size-[15px] mly-shrink-0" />
                Duplicate
              </BaseButton>
              <Divider type="horizontal" />
              <BaseButton
                onClick={deleteCurrentNode}
                className="mly-h-auto mly-justify-start mly-gap-2 !mly-rounded mly-bg-red-100 mly-px-2 mly-py-1 mly-text-sm mly-font-normal mly-text-red-600 hover:mly-bg-red-200 focus:mly-bg-red-200"
              >
                <Trash2 className="mly-size-[15px] mly-shrink-0" />
                Delete
              </BaseButton>
            </PopoverContent>
          </Popover>
        </div>
      </TooltipProvider>
    </DragHandle>
  );
}