import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useState } from 'react';

import type { NodeSelection } from '@tiptap/pm/state';

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
      
      // Check if the node can be moved up or down
      const { state } = editor;
      const { doc } = state;
      
      if (data.pos > 0) {
        // Get the depth of current node
        const $pos = doc.resolve(data.pos);
        const depth = $pos.depth;
        
        // Only allow moving if this is a top-level node (direct child of doc)
        if (depth === 1) {
          const index = $pos.index(0);
          setCanMoveUp(index > 0);
          setCanMoveDown(index < doc.content.childCount - 1);
        } else {
          setCanMoveUp(false);
          setCanMoveDown(false);
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
  
  function moveNodeUp() {
    if (!canMoveUp || currentNodePos === -1) return;
    
    const { state, dispatch } = editor.view;
    const { tr, doc } = state;
    
    // Get the current node position info
    const $pos = doc.resolve(currentNodePos);
    const index = $pos.index(0);
    
    // Get the node before the current node
    const prevIndex = index - 1;
    
    // Calculate positions
    let startPos = 0;
    for (let i = 0; i < prevIndex; i++) {
      startPos += doc.child(i).nodeSize;
    }
    
    const prevNodeSize = doc.child(prevIndex).nodeSize;
    const currentNodeSize = currentNode?.nodeSize || 0;
    
    // Create transaction to swap positions
    const transaction = tr.delete(currentNodePos, currentNodePos + currentNodeSize)
                          .insert(startPos, currentNode as Node);
    
    dispatch(transaction);
    
    // Update the current node position
    setCurrentNodePos(startPos);
  }
  
  function moveNodeDown() {
    if (!canMoveDown || currentNodePos === -1) return;
    
    const { state, dispatch } = editor.view;
    const { tr, doc } = state;
    
    // Get the current node position info
    const $pos = doc.resolve(currentNodePos);
    const index = $pos.index(0);
    
    // Get the node after the current node
    const nextIndex = index + 1;
    const nextNode = doc.child(nextIndex);
    const nextNodeSize = nextNode.nodeSize;
    const currentNodeSize = currentNode?.nodeSize || 0;
    
    // Create transaction to swap positions
    const transaction = tr.delete(currentNodePos, currentNodePos + currentNodeSize)
                          .insert(currentNodePos + nextNodeSize, currentNode as Node);
    
    dispatch(transaction);
    
    // Update the current node position
    setCurrentNodePos(currentNodePos + nextNodeSize);
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